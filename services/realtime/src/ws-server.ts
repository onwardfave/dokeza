import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import {
  REALTIME_PROTOCOL_VERSION,
  validateRealtimeJsonMessage,
  type RealtimeJsonMessage,
} from "@dokeza/contracts";
import type { Actor } from "@dokeza/authz";
import { RealtimeFrameAssembler } from "./frame-assembler.js";
import { SessionManager } from "./session-manager.js";
import {
  ChunkSttSession,
  DeterministicSttAdapter,
  supportsSttSessions,
  type SttAdapter,
  type SttSession,
  type SttSessionCloseReason,
  type SttTranscriptEvent,
} from "./stt-adapter.js";
import {
  InMemoryTranscriptTimelineSink,
  type TranscriptTimelineSink,
} from "./transcript-timeline.js";
import {
  evaluateTranscriptTimelinePersistence,
  type TranscriptRetentionMode,
} from "./transcript-retention-policy.js";
import { TranscriptProcessor } from "./transcript-processor.js";
import type { SessionStore } from "./session-store.js";

export interface TokenValidator {
  validate(token: string): Promise<Actor | undefined>;
}

export interface RealtimeServerOptions {
  tokenValidator: TokenValidator;
  sttAdapter?: SttAdapter;
  transcriptTimelineSink?: TranscriptTimelineSink;
  transcriptRetentionMode?: TranscriptRetentionMode;
  sessionStore?: SessionStore;
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

type SessionEndReason = Extract<RealtimeJsonMessage, { type: "session.end" }>["payload"]["reason"];
type SessionClosedReason = Extract<
  RealtimeJsonMessage,
  { type: "session.closed" }
>["payload"]["reason"];
type ErrorCode = Extract<RealtimeJsonMessage, { type: "error" }>["payload"]["code"];
type ReplayableTranscriptMessage = Extract<RealtimeJsonMessage, { type: "transcript.final" }>;

const MAX_REPLAYABLE_TRANSCRIPTS_PER_SESSION = 1000;

function mapEndReasonToClosedReason(reason: SessionEndReason): SessionClosedReason {
  switch (reason) {
    case "user_stopped":
    case "app_shutdown":
      return "user_stopped";
    case "policy_stopped":
      return "policy_violation";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export function createRealtimeServer(options: RealtimeServerOptions): RealtimeServerHandle {
  const sessionManager = new SessionManager();
  const sttAdapter = options.sttAdapter ?? new DeterministicSttAdapter();
  const transcriptTimelineSink =
    options.transcriptTimelineSink ?? new InMemoryTranscriptTimelineSink();
  const transcriptRetentionMode = options.transcriptRetentionMode ?? "7_days";
  const sessionStore = options.sessionStore;
  const replayableTranscriptsBySession = new Map<string, ReplayableTranscriptMessage[]>();
  const httpServer = createServer((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket) => {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const assembler = new RealtimeFrameAssembler();
    let transcriptProcessor: TranscriptProcessor | undefined;
    let sttSessionPromise: Promise<SttSession> | undefined;
    let sttSession: SttSession | undefined;
    let authenticated = false;
    let sessionPersisted = false;

    const sendJson = (message: Record<string, unknown>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    };

    const sendError = (
      code: ErrorCode,
      errorMessage: string,
      recoverable: boolean,
      sessionId?: string,
      retryAfterMs?: number,
    ) => {
      const seq = sessionId !== undefined ? sessionManager.nextServerSeq(sessionId) : 0;
      const payload: Record<string, unknown> = { code, message: errorMessage, recoverable };
      if (retryAfterMs !== undefined) {
        payload.retry_after_ms = retryAfterMs;
      }

      sendJson({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "error",
        seq: seq ?? 0,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload,
      });
    };

    const sendTranscript = (sessionId: string, event: SttTranscriptEvent) => {
      const seq = sessionManager.nextServerSeq(sessionId);
      const message = {
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: event.type,
        seq: seq ?? 0,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: event.payload,
      } as RealtimeJsonMessage;

      if (event.type === "transcript.final") {
        const replayableMessage = message as ReplayableTranscriptMessage;
        const replayableMessages = replayableTranscriptsBySession.get(sessionId) ?? [];
        replayableMessages.push(replayableMessage);
        if (replayableMessages.length > MAX_REPLAYABLE_TRANSCRIPTS_PER_SESSION) {
          replayableMessages.splice(
            0,
            replayableMessages.length - MAX_REPLAYABLE_TRANSCRIPTS_PER_SESSION,
          );
        }
        replayableTranscriptsBySession.set(sessionId, replayableMessages);
      }

      sendJson(message);
    };

    const sendTranscriptPersistenceError = (sessionId: string) => {
      const session = sessionManager.getSession(sessionId);
      if (session === undefined || session.state !== "active") {
        return;
      }

      sendError("transcript_persistence_failed", "Transcript persistence failed.", true, sessionId);
    };

    const sendSessionPersistenceError = (sessionId: string) => {
      const session = sessionManager.getSession(sessionId);
      if (session === undefined) {
        return;
      }

      sendError("session_persistence_failed", "Session persistence failed.", true, sessionId);
    };

    const replayTranscriptMessages = (sessionId: string, lastServerSeq: number): void => {
      const replayableMessages = replayableTranscriptsBySession.get(sessionId) ?? [];
      for (const message of replayableMessages) {
        if (message.seq > lastServerSeq) {
          sendJson(message);
        }
      }
    };

    const updateSessionRecoveryState = async (
      sessionId: string,
      workspaceId: string,
      lastClientSeq: number,
      lastServerSeq: number,
      currentConnectionId: string,
    ): Promise<void> => {
      if (sessionStore === undefined) {
        return;
      }

      try {
        await sessionStore.updateSeqState({
          sessionId,
          workspaceId,
          lastClientSeq,
          lastServerSeq,
          connectionId: currentConnectionId,
        });
      } catch {
        sendSessionPersistenceError(sessionId);
      }
    };

    const persistTranscriptEvent = async (
      sessionId: string,
      workspaceId: string,
      event: SttTranscriptEvent,
    ): Promise<void> => {
      if (event.type !== "transcript.final") {
        return;
      }

      const persistenceDecision = evaluateTranscriptTimelinePersistence({
        retentionMode: transcriptRetentionMode,
        timelineRecordKind: "segment",
        workspaceId,
        sessionId,
      });
      if (persistenceDecision.action === "skip") {
        return;
      }

      try {
        await transcriptTimelineSink.recordTranscriptEvent({
          workspaceId,
          sessionId,
          event,
        });
      } catch {
        sendTranscriptPersistenceError(sessionId);
      }
    };

    const emitTranscriptEvents = async (
      sessionId: string,
      events: SttTranscriptEvent[],
    ): Promise<void> => {
      const session = sessionManager.getSession(sessionId);
      if (session === undefined || session.state !== "active") {
        return;
      }

      for (const event of events) {
        const processed = transcriptProcessor?.process(event);
        if (processed?.action === "emit") {
          sendTranscript(sessionId, processed.event);
          await persistTranscriptEvent(sessionId, session.workspaceId, processed.event);
        }
      }
    };

    const getSttSession = (sessionId: string, workspaceId: string): Promise<SttSession> => {
      if (sttSession !== undefined) {
        return Promise.resolve(sttSession);
      }

      if (sttSessionPromise !== undefined) {
        return sttSessionPromise;
      }

      sttSessionPromise = supportsSttSessions(sttAdapter)
        ? sttAdapter.startSession({
            sessionId,
            workspaceId,
            emitTranscriptEvents: (events) => {
              void emitTranscriptEvents(sessionId, events);
            },
            emitError: (error) => {
              const session = sessionManager.getSession(sessionId);
              if (session === undefined || session.state !== "active") {
                return;
              }
              sendError(
                error.code,
                error.message,
                error.recoverable,
                sessionId,
                error.retry_after_ms,
              );
            },
          })
        : Promise.resolve(new ChunkSttSession(sttAdapter));

      sttSessionPromise = sttSessionPromise.then((createdSession) => {
        sttSession = createdSession;
        return createdSession;
      });

      return sttSessionPromise;
    };

    const closeSttSession = async (reason: SttSessionCloseReason): Promise<void> => {
      const session = sttSession ?? (await sttSessionPromise?.catch(() => undefined));
      if (session !== undefined) {
        await session.close(reason);
      }
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
          return;
        }

        if (result.type === "audio.chunk") {
          const session = sessionManager.getSessionByConnection(connectionId);
          if (session === undefined) {
            sendError("auth_failed", "Session not found", false);
            ws.close(1008, "auth_failed");
            return;
          }

          try {
            const activeSttSession = await getSttSession(session.sessionId, session.workspaceId);
            const sttResult = await activeSttSession.transcribeChunk({
              sessionId: session.sessionId,
              workspaceId: session.workspaceId,
              meta: result.meta,
              bytes: result.bytes,
            });

            if ("error" in sttResult) {
              sendError(
                sttResult.error.code,
                sttResult.error.message,
                sttResult.error.recoverable,
                session.sessionId,
                sttResult.error.retry_after_ms,
              );
              return;
            }

            await emitTranscriptEvents(session.sessionId, sttResult.events);
          } catch {
            sendError(
              "stt_provider_timeout",
              "Transcription provider timed out.",
              true,
              session.sessionId,
              2000,
            );
          }
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

        const authResult = sessionManager.authenticate(
          connectionId,
          actor,
          workspaceId,
          parsed.seq,
        );
        if ("error" in authResult) {
          sendError("auth_failed", authResult.error, false);
          ws.close(1008, "auth_failed");
          return;
        }

        authenticated = true;
        transcriptProcessor = new TranscriptProcessor({
          sessionId: authResult.session.sessionId,
          workspaceId: authResult.session.workspaceId,
        });
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
              retention_mode: transcriptRetentionMode,
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

      if (parsed.type === "resume.request") {
        const resumeResult = sessionManager.resumeSession({
          sessionId: parsed.session_id,
          previousConnectionId: parsed.payload.previous_connection_id,
          newConnectionId: connectionId,
          actor: session.actor,
          workspaceId: session.workspaceId,
          lastClientSeq: Math.max(parsed.payload.last_client_seq, parsed.seq),
          lastServerSeq: parsed.payload.last_server_seq,
        });

        if ("error" in resumeResult) {
          sendError(
            "session_not_resumable",
            "Session cannot be resumed.",
            false,
            session.sessionId,
          );
          return;
        }

        transcriptProcessor = new TranscriptProcessor({
          sessionId: resumeResult.session.sessionId,
          workspaceId: resumeResult.session.workspaceId,
        });
        sessionPersisted = sessionStore !== undefined;
        await updateSessionRecoveryState(
          resumeResult.session.sessionId,
          resumeResult.session.workspaceId,
          resumeResult.session.clientSeq,
          resumeResult.session.serverSeq,
          connectionId,
        );
        replayTranscriptMessages(resumeResult.session.sessionId, parsed.payload.last_server_seq);
        return;
      }

      if (parsed.session_id !== session.sessionId) {
        sendError(
          "invalid_message",
          "Session ID does not match connection",
          false,
          session.sessionId,
        );
        return;
      }

      if (!sessionManager.advanceClientSeq(session.sessionId, parsed.seq)) {
        sendError("invalid_message", "Client sequence is not monotonic", true, session.sessionId);
        return;
      }

      if (parsed.type === "session.start" && parsed.payload.workspace_id !== session.workspaceId) {
        sendError(
          "auth_failed",
          "Workspace does not match authenticated session",
          false,
          session.sessionId,
        );
        ws.close(1008, "auth_failed");
        return;
      }

      const frameResult = assembler.handleJsonMessage(parsed);

      if (frameResult.type === "error") {
        sendError(frameResult.code, frameResult.code, frameResult.recoverable, session.sessionId);
        return;
      }

      if (frameResult.type === "json" && frameResult.message.type === "session.start") {
        if (sessionStore !== undefined && !sessionPersisted) {
          try {
            await sessionStore.create({
              id: session.sessionId,
              workspaceId: session.workspaceId,
              createdBy: session.actor.userId,
              meetingSource: frameResult.message.payload.meeting_source,
              connectionId,
            });
            sessionPersisted = true;
          } catch {
            sendSessionPersistenceError(session.sessionId);
          }
        }
        return;
      }

      if (frameResult.type === "audio.gap") {
        const persistenceDecision = evaluateTranscriptTimelinePersistence({
          retentionMode: transcriptRetentionMode,
          timelineRecordKind: "gap",
          workspaceId: session.workspaceId,
          sessionId: session.sessionId,
        });
        if (persistenceDecision.action === "skip") {
          return;
        }

        try {
          await transcriptTimelineSink.recordGap({
            workspaceId: session.workspaceId,
            sessionId: session.sessionId,
            stream: frameResult.gap.stream,
            startMs: frameResult.gap.start_ms,
            endMs: frameResult.gap.end_ms,
            droppedChunks: frameResult.gap.dropped_chunks,
            reason: frameResult.gap.reason,
          });
        } catch {
          sendTranscriptPersistenceError(session.sessionId);
        }
      }

      if (frameResult.type === "json" && frameResult.message.type === "suggestion.request") {
        sendError(
          "feature_unavailable",
          "Live suggestions are not available in this milestone.",
          true,
          session.sessionId,
        );
        return;
      }

      if (frameResult.type === "json" && frameResult.message.type === "context.update") {
        sendError(
          "feature_unavailable",
          "Screen context updates are not processed in this milestone.",
          true,
          session.sessionId,
        );
        return;
      }

      // Handle session.end
      if (
        frameResult.type === "json" &&
        frameResult.message.type === "session.end" &&
        session !== undefined
      ) {
        transcriptProcessor?.close();
        await closeSttSession("session.end").catch(() => undefined);
        sessionManager.endSession(session.sessionId, frameResult.message.payload.reason);
        const serverSeq = sessionManager.nextServerSeq(session.sessionId);
        const closedReason = mapEndReasonToClosedReason(frameResult.message.payload.reason);
        if (sessionStore !== undefined && sessionPersisted) {
          try {
            await sessionStore.updateSeqState({
              sessionId: session.sessionId,
              workspaceId: session.workspaceId,
              lastClientSeq: session.clientSeq,
              lastServerSeq: serverSeq ?? session.serverSeq,
              connectionId,
            });
            await sessionStore.endSession({
              sessionId: session.sessionId,
              workspaceId: session.workspaceId,
            });
          } catch {
            sendSessionPersistenceError(session.sessionId);
          }
        }
        sendJson({
          protocol_version: REALTIME_PROTOCOL_VERSION,
          type: "session.closed",
          seq: serverSeq ?? 0,
          session_id: session.sessionId,
          sent_at: new Date().toISOString(),
          payload: {
            reason: closedReason,
            final_server_seq: serverSeq ?? 0,
          },
        });
      }
    });

    ws.on("close", () => {
      void closeSttSession("connection.closed").finally(() => {
        sessionManager.removeConnection(connectionId);
      });
    });

    ws.on("error", () => {
      void closeSttSession("connection.error").finally(() => {
        sessionManager.removeConnection(connectionId);
      });
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
