import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { REALTIME_PROTOCOL_VERSION, validateRealtimeJsonMessage } from "@dokeza/contracts";
import type { Actor } from "@dokeza/authz";
import { RealtimeFrameAssembler } from "./frame-assembler.js";
import { SessionManager } from "./session-manager.js";

export interface TokenValidator {
  validate(token: string): Promise<Actor | undefined>;
}

export interface RealtimeServerOptions {
  port?: number;
  tokenValidator: TokenValidator;
  env?: NodeJS.ProcessEnv;
}

export interface RealtimeServerHandle {
  httpServer: HttpServer;
  wss: WebSocketServer;
  sessionManager: SessionManager;
  close(): Promise<void>;
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.concat(data);
}

export function createRealtimeServer(options: RealtimeServerOptions): RealtimeServerHandle {
  const sessionManager = new SessionManager();
  const httpServer = createServer((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket) => {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const assembler = new RealtimeFrameAssembler();
    let authenticated = false;

    const sendJson = (message: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };

    const sendError = (
      code: string,
      errorMessage: string,
      recoverable: boolean,
      sessionId?: string,
    ) => {
      const seq = sessionId !== undefined ? sessionManager.nextServerSeq(sessionId) : 0;
      sendJson({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "error",
        seq: seq ?? 0,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: { code, message: errorMessage, recoverable },
      });
    };

    ws.on("message", async (data: RawData, isBinary: boolean) => {
      const buf = rawDataToBuffer(data);

      if (isBinary) {
        if (!authenticated) {
          sendError("auth_failed", "Must authenticate first", false);
          ws.close(1008, "auth_failed");
          return;
        }

        const result = assembler.handleBinaryFrame(new Uint8Array(buf));
        if (result.type === "error") {
          const session = sessionManager.getSessionByConnection(connectionId);
          sendError(result.code, result.code, result.recoverable, session?.sessionId);
        }
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(buf.toString("utf-8"));
      } catch {
        const session = sessionManager.getSessionByConnection(connectionId);
        sendError("invalid_message", "Invalid JSON message", true, session?.sessionId);
        return;
      }

      // Handle auth.hello before other messages
      if (
        !authenticated &&
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as Record<string, unknown>).type === "auth.hello"
      ) {
        if (!validateRealtimeJsonMessage(parsed) || parsed.type !== "auth.hello") {
          sendError("invalid_message", "Invalid auth.hello message", false);
          ws.close(1008, "auth_failed");
          return;
        }

        const actor = await options.tokenValidator.validate(parsed.payload.token);
        if (actor === undefined) {
          sendError("auth_failed", "Invalid token", false);
          ws.close(1008, "auth_failed");
          return;
        }

        // Extract workspace from token context or use a default for now
        const workspaceId = actor.memberships[0]?.workspaceId;
        if (workspaceId === undefined) {
          sendError("auth_failed", "No workspace membership", false);
          ws.close(1008, "auth_failed");
          return;
        }

        const authResult = sessionManager.authenticate(connectionId, actor, workspaceId, parsed.seq);
        if ("error" in authResult) {
          sendError("auth_failed", authResult.error, false);
          ws.close(1008, "auth_failed");
          return;
        }

        authenticated = true;
        const seq = sessionManager.nextServerSeq(authResult.session.sessionId);
        sendJson({
          protocol_version: REALTIME_PROTOCOL_VERSION,
          type: "auth.accepted",
          seq: seq ?? 1,
          session_id: authResult.session.sessionId,
          sent_at: new Date().toISOString(),
          payload: {
            connection_id: connectionId,
            workspace_id: workspaceId,
            policy: {
              screen_context_allowed: true,
              cloud_stt_allowed: true,
              direct_provider_stt_allowed: false,
              retention_mode: "7_days",
              max_local_audio_buffer_ms: 300000,
            },
          },
        });
        return;
      }

      if (!authenticated) {
        sendError("auth_failed", "Must authenticate first", false);
        ws.close(1008, "auth_failed");
        return;
      }

      // Dispatch through frame assembler
      if (!validateRealtimeJsonMessage(parsed)) {
        const session = sessionManager.getSessionByConnection(connectionId);
        sendError("invalid_message", "Invalid realtime message", true, session?.sessionId);
        return;
      }

      const session = sessionManager.getSessionByConnection(connectionId);
      if (session === undefined) {
        sendError("auth_failed", "Session not found", false);
        ws.close(1008, "auth_failed");
        return;
      }

      if (parsed.session_id !== session.sessionId) {
        sendError("invalid_message", "Session ID does not match connection", false, session.sessionId);
        return;
      }

      if (!sessionManager.advanceClientSeq(session.sessionId, parsed.seq)) {
        sendError("invalid_message", "Client sequence is not monotonic", true, session.sessionId);
        return;
      }

      if (parsed.type === "session.start" && parsed.payload.workspace_id !== session.workspaceId) {
        sendError("auth_failed", "Workspace does not match authenticated session", false, session.sessionId);
        ws.close(1008, "auth_failed");
        return;
      }

      const frameResult = assembler.handleJsonMessage(parsed);

      if (frameResult.type === "error") {
        sendError(frameResult.code, frameResult.code, frameResult.recoverable, session.sessionId);
        return;
      }

      // Handle session.end
      if (
        frameResult.type === "json" &&
        frameResult.message.type === "session.end" &&
        session !== undefined
      ) {
        sessionManager.endSession(session.sessionId, frameResult.message.payload.reason);
        const serverSeq = sessionManager.nextServerSeq(session.sessionId);
        sendJson({
          protocol_version: REALTIME_PROTOCOL_VERSION,
          type: "session.closed",
          seq: serverSeq ?? 0,
          session_id: session.sessionId,
          sent_at: new Date().toISOString(),
          payload: {
            reason: frameResult.message.payload.reason,
            final_server_seq: serverSeq ?? 0,
          },
        });
      }
    });

    ws.on("close", () => {
      sessionManager.removeConnection(connectionId);
    });

    ws.on("error", () => {
      sessionManager.removeConnection(connectionId);
    });
  });

  return {
    httpServer,
    wss,
    sessionManager,
    close: () =>
      new Promise<void>((resolve, reject) => {
        wss.close(() => {
          httpServer.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }),
  };
}
