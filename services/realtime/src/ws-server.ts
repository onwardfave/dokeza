import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { REALTIME_PROTOCOL_VERSION } from "@dokeza/contracts";
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

    ws.on("message", async (data: Buffer | ArrayBuffer | Buffer[]) => {
      // Binary frame: audio data
      if (!Buffer.isBuffer(data) && !(data instanceof ArrayBuffer)) {
        // Binary frame from concatenated buffers
        const combined = Buffer.concat(data as Buffer[]);
        const result = assembler.handleBinaryFrame(new Uint8Array(combined));
        if (result.type === "error") {
          const session = sessionManager.getSessionByConnection(connectionId);
          sendError(result.code, result.code, result.recoverable, session?.sessionId);
        }
        return;
      }

      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);

      // Try to parse as JSON text first
      let parsed: unknown;
      try {
        parsed = JSON.parse(buf.toString("utf-8"));
      } catch {
        // Not valid JSON — treat as binary audio frame
        const bytes = new Uint8Array(buf);
        const result = assembler.handleBinaryFrame(bytes);
        if (result.type === "error") {
          const session = sessionManager.getSessionByConnection(connectionId);
          sendError(result.code, result.code, result.recoverable, session?.sessionId);
        }
        return;
      }

      // Handle auth.hello before other messages
      if (
        !authenticated &&
        typeof parsed === "object" &&
        parsed !== null &&
        (parsed as Record<string, unknown>).type === "auth.hello"
      ) {
        const payload = (parsed as Record<string, unknown>).payload as
          | Record<string, unknown>
          | undefined;
        const token = payload?.token;
        if (typeof token !== "string") {
          sendError("auth_failed", "Missing or invalid token", false);
          ws.close(1008, "auth_failed");
          return;
        }

        const actor = await options.tokenValidator.validate(token);
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

        const authResult = sessionManager.authenticate(connectionId, actor, workspaceId);
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
      const frameResult = assembler.handleJsonMessage(parsed);
      const session = sessionManager.getSessionByConnection(connectionId);

      if (frameResult.type === "error") {
        sendError(frameResult.code, frameResult.code, frameResult.recoverable, session?.sessionId);
        return;
      }

      // Advance client sequence
      if (session !== undefined && typeof parsed === "object" && parsed !== null) {
        const seq = (parsed as Record<string, unknown>).seq;
        if (typeof seq === "number") {
          sessionManager.advanceClientSeq(session.sessionId, seq);
        }
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
