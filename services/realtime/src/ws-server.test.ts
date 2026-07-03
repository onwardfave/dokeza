import { describe, expect, it, afterEach } from "vitest";
import { WebSocket, type RawData } from "ws";
import { REALTIME_PROTOCOL_VERSION } from "@dokeza/contracts";
import { createTestActor } from "@dokeza/test-fixtures";
import {
  createRealtimeServer,
  type RealtimeServerHandle,
  type RealtimeServerOptions,
  type TokenValidator,
} from "./ws-server.js";
import type {
  SttAdapter,
  SttSession,
  SttSessionCloseReason,
  SttSessionStartInput,
  SttTranscriptEvent,
} from "./stt-adapter.js";
import type {
  TranscriptGapRecordInput,
  TranscriptTimelineSink,
  TranscriptWriteInput,
} from "./transcript-timeline.js";
import type { TranscriptRetentionMode } from "./transcript-retention-policy.js";
import type {
  CreateSessionInput,
  EndSessionInput,
  SessionStore,
  UpdateSessionSeqInput,
} from "./session-store.js";

function createTestTokenValidator(): TokenValidator {
  return {
    async validate(token: string) {
      if (token === "valid_token") {
        return {
          actor: createTestActor({ workspaceId: "ws_test_1" }),
          workspaceId: "ws_test_1",
          deviceId: "dev_test_1",
        };
      }
      return undefined;
    },
  };
}

function getServerPort(handle: RealtimeServerHandle): number {
  const addr = handle.httpServer.address();
  if (addr === null || typeof addr === "string") throw new Error("Server not listening");
  return addr.port;
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function sendAndReceive(
  ws: WebSocket,
  message: Record<string, unknown>,
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  const response = receiveJson(ws, timeoutMs);
  ws.send(JSON.stringify(message));
  return response;
}

function sendRawAndReceive(
  ws: WebSocket,
  data: string | Buffer,
  options?: { binary?: boolean; timeoutMs?: number },
): Promise<Record<string, unknown>> {
  const response = receiveJson(ws, options?.timeoutMs ?? 3000);
  ws.send(data, { binary: options?.binary ?? Buffer.isBuffer(data) });
  return response;
}

function receiveJson(ws: WebSocket, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for response")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function receiveJsonMessages(
  ws: WebSocket,
  count: number,
  timeoutMs = 3000,
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const messages: Record<string, unknown>[] = [];
    const timeout = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("Timeout waiting for responses"));
    }, timeoutMs);

    const onMessage = (data: RawData) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch (err) {
        clearTimeout(timeout);
        ws.off("message", onMessage);
        reject(err);
        return;
      }

      if (messages.length === count) {
        clearTimeout(timeout);
        ws.off("message", onMessage);
        resolve(messages);
      }
    };

    ws.on("message", onMessage);
  });
}

function waitForClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.on("close", (code) => resolve(code));
  });
}

describe("createRealtimeServer", () => {
  let handle: RealtimeServerHandle | undefined;
  const clients: WebSocket[] = [];

  afterEach(async () => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    clients.length = 0;
    if (handle !== undefined) {
      await handle.close();
      handle = undefined;
    }
  });

  async function startServer(
    options: {
      sttAdapter?: SttAdapter;
      transcriptTimelineSink?: TranscriptTimelineSink;
      transcriptRetentionMode?: TranscriptRetentionMode;
      sessionStore?: SessionStore;
      tokenValidator?: TokenValidator;
      liveSuggestionService?: RealtimeServerOptions["liveSuggestionService"];
    } = {},
  ): Promise<{ port: number }> {
    const serverOptions: RealtimeServerOptions = {
      tokenValidator: options.tokenValidator ?? createTestTokenValidator(),
    };
    if (options.sttAdapter !== undefined) {
      serverOptions.sttAdapter = options.sttAdapter;
    }
    if (options.transcriptTimelineSink !== undefined) {
      serverOptions.transcriptTimelineSink = options.transcriptTimelineSink;
    }
    if (options.transcriptRetentionMode !== undefined) {
      serverOptions.transcriptRetentionMode = options.transcriptRetentionMode;
    }
    if (options.sessionStore !== undefined) {
      serverOptions.sessionStore = options.sessionStore;
    }
    if (options.liveSuggestionService !== undefined) {
      serverOptions.liveSuggestionService = options.liveSuggestionService;
    }

    handle = createRealtimeServer(serverOptions);
    await new Promise<void>((resolve) => {
      handle!.httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    return { port: getServerPort(handle) };
  }

  function createRecordingTranscriptSink(): TranscriptTimelineSink & {
    transcriptWrites: TranscriptWriteInput[];
    gapWrites: TranscriptGapRecordInput[];
  } {
    const transcriptWrites: TranscriptWriteInput[] = [];
    const gapWrites: TranscriptGapRecordInput[] = [];

    return {
      transcriptWrites,
      gapWrites,
      async recordTranscriptEvent(input) {
        transcriptWrites.push(input);
        return { status: "recorded", telemetry: [] };
      },
      async recordGap(input) {
        gapWrites.push(input);
        return { status: "recorded", telemetry: [] };
      },
      getSnapshot(workspaceId, sessionId) {
        return {
          workspaceId,
          sessionId,
          segments: [],
          gaps: [],
        };
      },
    };
  }

  function createRecordingSessionStore(): SessionStore & {
    creates: CreateSessionInput[];
    seqUpdates: UpdateSessionSeqInput[];
    ends: EndSessionInput[];
  } {
    const creates: CreateSessionInput[] = [];
    const seqUpdates: UpdateSessionSeqInput[] = [];
    const ends: EndSessionInput[] = [];

    return {
      creates,
      seqUpdates,
      ends,
      async create(input) {
        creates.push(input);
        return {
          id: input.id,
          workspaceId: input.workspaceId,
          createdBy: input.createdBy,
          meetingSource: input.meetingSource,
          status: "active",
          startedAt: new Date(),
          endedAt: null,
          lastClientSeq: 0,
          lastServerSeq: 0,
          connectionId: input.connectionId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      async getById() {
        return undefined;
      },
      async listByWorkspace() {
        return [];
      },
      async updateSeqState(input) {
        seqUpdates.push(input);
        return undefined;
      },
      async endSession(input) {
        ends.push(input);
        return undefined;
      },
    };
  }

  async function connect(port: number): Promise<WebSocket> {
    const ws = await connectClient(port);
    clients.push(ws);
    return ws;
  }

  async function authenticateWithDetails(
    ws: WebSocket,
    token = "valid_token",
  ): Promise<{ sessionId: string; connectionId: string; workspaceId: string }> {
    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token,
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });

    expect(authResponse.type).toBe("auth.accepted");
    const payload = authResponse.payload as { connection_id: string; workspace_id: string };
    return {
      sessionId: authResponse.session_id as string,
      connectionId: payload.connection_id,
      workspaceId: payload.workspace_id,
    };
  }

  async function authenticate(ws: WebSocket): Promise<string> {
    return (await authenticateWithDetails(ws)).sessionId;
  }

  it("accepts a valid auth.hello and returns auth.accepted", async () => {
    const { port } = await startServer();
    const ws = await connect(port);

    const response = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });

    expect(response.type).toBe("auth.accepted");
    expect(response.protocol_version).toBe(REALTIME_PROTOCOL_VERSION);
    expect((response.payload as Record<string, unknown>).workspace_id).toBe("ws_test_1");
    expect((response.payload as { policy: { retention_mode: string } }).policy.retention_mode).toBe(
      "7_days",
    );
  });

  it("advertises the configured transcript retention mode", async () => {
    const { port } = await startServer({ transcriptRetentionMode: "live_only" });
    const ws = await connect(port);

    const response = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });

    expect(response.type).toBe("auth.accepted");
    expect((response.payload as { policy: { retention_mode: string } }).policy.retention_mode).toBe(
      "live_only",
    );
  });

  it("rejects an invalid token and closes the connection", async () => {
    const { port } = await startServer();
    const ws = await connect(port);
    const closePromise = waitForClose(ws);

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "auth.hello",
        seq: 1,
        sent_at: new Date().toISOString(),
        payload: {
          token: "bad_token",
          client_version: "0.1.0",
          platform: "windows",
          device_id: "dev_test_1",
        },
      }),
    );

    const code = await closePromise;
    expect(code).toBe(1008);
  });

  it("rejects auth when the device does not match the token context", async () => {
    const tokenValidator: TokenValidator = {
      async validate() {
        return {
          actor: createTestActor({ workspaceId: "ws_test_1" }),
          workspaceId: "ws_test_1",
          deviceId: "dev_expected",
        };
      },
    };
    const { port } = await startServer({ tokenValidator });
    const ws = await connect(port);
    const closePromise = waitForClose(ws);

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "auth.hello",
        seq: 1,
        sent_at: new Date().toISOString(),
        payload: {
          token: "valid_token",
          client_version: "0.1.0",
          platform: "windows",
          device_id: "dev_other",
        },
      }),
    );

    const code = await closePromise;
    expect(code).toBe(1008);
  });

  it("rejects messages before authentication", async () => {
    const { port } = await startServer();
    const ws = await connect(port);
    const closePromise = waitForClose(ws);

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "session.start",
        seq: 1,
        session_id: "sess_fake",
        sent_at: new Date().toISOString(),
        payload: {
          workspace_id: "ws_test_1",
          meeting_source: "test",
          capture: { microphone: true, system_audio: false, screen_context: false },
          processing: { stt: "cloud", llm: "cloud", retrieval: "cloud" },
        },
      }),
    );

    const code = await closePromise;
    expect(code).toBe(1008);
  });

  it("handles a full session lifecycle: auth → session.end → session.closed", async () => {
    const { port } = await startServer();
    const ws = await connect(port);

    // Authenticate
    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    expect(authResponse.type).toBe("auth.accepted");
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "session.start",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          workspace_id: "ws_test_1",
          meeting_source: "test",
          capture: { microphone: true, system_audio: false, screen_context: false },
          processing: { stt: "cloud", llm: "cloud", retrieval: "cloud" },
        },
      }),
    );

    // End session
    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
    expect((closedResponse.payload as Record<string, unknown>).reason).toBe("user_stopped");
  });

  it("persists session start and end through the configured session store", async () => {
    const sessionStore = createRecordingSessionStore();
    const { port } = await startServer({ sessionStore });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;
    const connectionId = (authResponse.payload as { connection_id: string }).connection_id;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "session.start",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          workspace_id: "ws_test_1",
          meeting_source: "manual",
          capture: { microphone: true, system_audio: false, screen_context: false },
          processing: { stt: "cloud", llm: "cloud", retrieval: "cloud" },
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sessionStore.creates).toEqual([
      {
        id: sessionId,
        workspaceId: "ws_test_1",
        createdBy: "user_test_1",
        meetingSource: "manual",
        connectionId,
      },
    ]);

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
    expect(sessionStore.seqUpdates).toEqual([
      {
        sessionId,
        workspaceId: "ws_test_1",
        lastClientSeq: 3,
        lastServerSeq: 2,
        connectionId,
      },
    ]);
    expect(sessionStore.ends).toEqual([{ sessionId, workspaceId: "ws_test_1" }]);
  });

  it("keeps the session open and emits a recoverable error when session persistence fails", async () => {
    const sessionStore = createRecordingSessionStore();
    sessionStore.create = async () => {
      throw new Error("database unavailable with meeting source manual");
    };

    const { port } = await startServer({ sessionStore });
    const ws = await connect(port);
    const sessionId = await authenticate(ws);

    const response = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.start",
      seq: 2,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        workspace_id: "ws_test_1",
        meeting_source: "manual",
        capture: { microphone: true, system_audio: false, screen_context: false },
        processing: { stt: "cloud", llm: "cloud", retrieval: "cloud" },
      },
    });

    expect(response.type).toBe("error");
    expect((response.payload as Record<string, unknown>).code).toBe("session_persistence_failed");
    expect((response.payload as Record<string, unknown>).recoverable).toBe(true);
    expect(JSON.stringify(response)).not.toContain("manual");

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });
    expect(closedResponse.type).toBe("session.closed");
  });

  it.each([
    { endReason: "app_shutdown", closedReason: "user_stopped" },
    { endReason: "policy_stopped", closedReason: "policy_violation" },
  ])("maps $endReason session.end to $closedReason session.closed", async (testCase) => {
    const { port } = await startServer();
    const ws = await connect(port);
    const sessionId = await authenticate(ws);

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 2,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: testCase.endReason,
        last_client_seq: 2,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
    expect((closedResponse.payload as Record<string, unknown>).reason).toBe(testCase.closedReason);
  });

  it("resumes the original session and replays missed final transcripts", async () => {
    const sessionStore = createRecordingSessionStore();
    const transcriptTimelineSink = createRecordingTranscriptSink();
    const sttAdapter: SttAdapter = {
      async transcribeChunk(input) {
        return {
          events: [
            {
              type: "transcript.final",
              payload: {
                segment_id: "seg_resume",
                speaker: "user",
                text: "missed final",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.91,
              },
            },
          ],
          telemetry: [],
        };
      },
    };

    const { port } = await startServer({ sttAdapter, transcriptTimelineSink, sessionStore });
    const firstClient = await connect(port);
    const firstAuth = await authenticateWithDetails(firstClient);

    firstClient.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "session.start",
        seq: 2,
        session_id: firstAuth.sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          workspace_id: "ws_test_1",
          meeting_source: "manual",
          capture: { microphone: true, system_audio: false, screen_context: false },
          processing: { stt: "cloud", llm: "cloud", retrieval: "cloud" },
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sessionStore.creates).toEqual([
      {
        id: firstAuth.sessionId,
        workspaceId: "ws_test_1",
        createdBy: "user_test_1",
        meetingSource: "manual",
        connectionId: firstAuth.connectionId,
      },
    ]);

    firstClient.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 3,
        session_id: firstAuth.sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_resume",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 2,
        },
      }),
    );

    const originalTranscriptPromise = receiveJson(firstClient, 500);
    firstClient.send(Buffer.from([1, 2]), { binary: true });
    const originalTranscript = await originalTranscriptPromise;
    expect(originalTranscript.type).toBe("transcript.final");
    expect(originalTranscript.session_id).toBe(firstAuth.sessionId);
    const transcriptSeq = originalTranscript.seq as number;
    expect(transcriptSeq).toBeGreaterThan(1);
    expect(transcriptTimelineSink.transcriptWrites).toHaveLength(1);

    const firstClose = waitForClose(firstClient);
    firstClient.close();
    await firstClose;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const secondClient = await connect(port);
    const secondAuth = await authenticateWithDetails(secondClient);
    expect(secondAuth.sessionId).not.toBe(firstAuth.sessionId);

    const replayedTranscript = await sendAndReceive(secondClient, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "resume.request",
      seq: 2,
      session_id: firstAuth.sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        previous_connection_id: firstAuth.connectionId,
        last_client_seq: 3,
        last_server_seq: transcriptSeq - 1,
      },
    });

    expect(replayedTranscript.type).toBe("transcript.final");
    expect(replayedTranscript.session_id).toBe(firstAuth.sessionId);
    expect(replayedTranscript.seq).toBe(transcriptSeq);
    expect((replayedTranscript.payload as Record<string, unknown>).text).toBe("missed final");
    expect(handle!.sessionManager.getSessionByConnection(secondAuth.connectionId)?.sessionId).toBe(
      firstAuth.sessionId,
    );
    expect(transcriptTimelineSink.transcriptWrites).toHaveLength(1);
    expect(sessionStore.seqUpdates).toEqual([
      {
        sessionId: firstAuth.sessionId,
        workspaceId: "ws_test_1",
        lastClientSeq: 3,
        lastServerSeq: transcriptSeq,
        connectionId: secondAuth.connectionId,
      },
    ]);

    const secondClose = waitForClose(secondClient);
    secondClient.close();
    await secondClose;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const thirdClient = await connect(port);
    const thirdAuth = await authenticateWithDetails(thirdClient);
    const replayedAgain = await sendAndReceive(thirdClient, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "resume.request",
      seq: 2,
      session_id: firstAuth.sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        previous_connection_id: secondAuth.connectionId,
        last_client_seq: 3,
        last_server_seq: transcriptSeq - 1,
      },
    });

    expect(replayedAgain.type).toBe("transcript.final");
    expect(replayedAgain.session_id).toBe(firstAuth.sessionId);
    expect(handle!.sessionManager.getSessionByConnection(thirdAuth.connectionId)?.sessionId).toBe(
      firstAuth.sessionId,
    );
    expect(transcriptTimelineSink.transcriptWrites).toHaveLength(1);
  });

  it("rejects cross-workspace resume attempts without replaying transcript content", async () => {
    const tokenValidator: TokenValidator = {
      async validate(token: string) {
        if (token === "workspace_one") {
          return {
            actor: createTestActor({ userId: "user_1", workspaceId: "ws_test_1" }),
            workspaceId: "ws_test_1",
          };
        }
        if (token === "workspace_two") {
          return {
            actor: createTestActor({ userId: "user_1", workspaceId: "ws_test_2" }),
            workspaceId: "ws_test_2",
          };
        }
        return undefined;
      },
    };

    const { port } = await startServer({ tokenValidator });
    const firstClient = await connect(port);
    const firstAuth = await authenticateWithDetails(firstClient, "workspace_one");
    const firstClose = waitForClose(firstClient);
    firstClient.close();
    await firstClose;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const secondClient = await connect(port);
    await authenticateWithDetails(secondClient, "workspace_two");

    const response = await sendAndReceive(secondClient, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "resume.request",
      seq: 2,
      session_id: firstAuth.sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        previous_connection_id: firstAuth.connectionId,
        last_client_seq: 1,
        last_server_seq: 1,
      },
    });

    expect(response.type).toBe("error");
    expect(response.payload).toMatchObject({
      code: "session_not_resumable",
      recoverable: false,
    });
    expect(JSON.stringify(response)).not.toContain(firstAuth.sessionId);
  });

  it("streams live suggestion tokens and completion for manual requests", async () => {
    const requests: unknown[] = [];
    const { port } = await startServer({
      liveSuggestionService: {
        async *streamLiveSuggestion(input) {
          requests.push(input);
          yield {
            type: "token",
            requestId: input.requestId,
            suggestionId: `sug_${input.requestId}`,
            token: "First ",
            index: 0,
          };
          yield {
            type: "token",
            requestId: input.requestId,
            suggestionId: `sug_${input.requestId}`,
            token: "answer",
            index: 1,
          };
          yield {
            type: "complete",
            requestId: input.requestId,
            suggestionId: `sug_${input.requestId}`,
            kind: input.kind,
            content: "First answer",
            sources: [],
            confidence: "medium",
            promptVersion: "live.answer.v1",
            model: "deterministic-live-v1",
            telemetry: [],
          };
        },
      },
    });
    const ws = await connect(port);
    const sessionId = await authenticate(ws);

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "suggestion.request",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          request_id: "sreq_test",
          kind: "answer_question",
          user_prompt: "content must not appear in telemetry",
          include_sources: true,
        },
      }),
    );

    const responses = await receiveJsonMessages(ws, 3);

    expect(responses.map((response) => response.type)).toEqual([
      "suggestion.stream_token",
      "suggestion.stream_token",
      "suggestion.complete",
    ]);
    expect(responses[0]?.payload).toMatchObject({
      request_id: "sreq_test",
      suggestion_id: "sug_sreq_test",
      token: "First ",
      index: 0,
    });
    expect(responses[2]?.payload).toMatchObject({
      request_id: "sreq_test",
      suggestion_id: "sug_sreq_test",
      kind: "answer_question",
      content: "First answer",
      sources: [],
      confidence: "medium",
      prompt_version: "live.answer.v1",
      model: "deterministic-live-v1",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      workspaceId: "ws_test_1",
      sessionId,
      requestId: "sreq_test",
      kind: "answer_question",
      includeSources: true,
      userPrompt: "content must not appear in telemetry",
    });

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
  });

  it("returns a recoverable LLM error without leaking request prompt content", async () => {
    const { port } = await startServer({
      liveSuggestionService: {
        streamLiveSuggestion() {
          return {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<never>> {
                  throw new Error("provider failed with sensitive request");
                },
              };
            },
          };
        },
      },
    });
    const ws = await connect(port);
    const sessionId = await authenticate(ws);

    const response = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "suggestion.request",
      seq: 2,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        request_id: "sreq_test",
        kind: "answer_question",
        user_prompt: "content must not appear in telemetry",
        include_sources: true,
      },
    });

    expect(response.type).toBe("error");
    expect(response.payload).toMatchObject({
      code: "llm_provider_timeout",
      recoverable: true,
    });
    expect(JSON.stringify(response)).not.toContain("content must not appear in telemetry");
    expect(JSON.stringify(response)).not.toContain("sensitive request");

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
  });

  it("returns an explicit error for unprocessed context updates", async () => {
    const { port } = await startServer();
    const ws = await connect(port);
    const sessionId = await authenticate(ws);

    const response = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "context.update",
      seq: 2,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        source: "active_window",
        title: "Sensitive Window Title",
        app: "Chrome",
        text: "sensitive context text",
        captured_at: new Date().toISOString(),
      },
    });

    expect(response.type).toBe("error");
    expect(response.payload).toMatchObject({
      code: "feature_unavailable",
      recoverable: true,
    });
    expect(JSON.stringify(response)).not.toContain("Sensitive Window Title");
    expect(JSON.stringify(response)).not.toContain("sensitive context text");
  });

  it("rejects post-auth messages whose session_id does not match the connection session", async () => {
    const { port } = await startServer();
    const ws = await connect(port);

    await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });

    const response = await sendAndReceive(
      ws,
      {
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "session.start",
        seq: 2,
        session_id: "sess_other",
        sent_at: new Date().toISOString(),
        payload: {
          workspace_id: "ws_test_1",
          meeting_source: "test",
          capture: { microphone: true, system_audio: false, screen_context: false },
          processing: { stt: "cloud", llm: "cloud", retrieval: "cloud" },
        },
      },
      500,
    );

    expect(response.type).toBe("error");
    expect((response.payload as Record<string, unknown>).code).toBe("invalid_message");
  });

  it("rejects session.start for a workspace outside the authenticated session", async () => {
    const { port } = await startServer();
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const closePromise = waitForClose(ws);

    const response = await sendAndReceive(
      ws,
      {
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "session.start",
        seq: 2,
        session_id: authResponse.session_id,
        sent_at: new Date().toISOString(),
        payload: {
          workspace_id: "ws_other",
          meeting_source: "test",
          capture: { microphone: true, system_audio: false, screen_context: false },
          processing: { stt: "cloud", llm: "cloud", retrieval: "cloud" },
        },
      },
      500,
    );

    expect(response.type).toBe("error");
    expect((response.payload as Record<string, unknown>).code).toBe("auth_failed");
    await expect(closePromise).resolves.toBe(1008);
  });

  it("rejects duplicate or stale client sequence numbers before processing messages", async () => {
    const { port } = await startServer();
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });

    const response = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 1,
      session_id: authResponse.session_id,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 1,
      },
    });

    expect(response.type).toBe("error");
    expect((response.payload as Record<string, unknown>).code).toBe("invalid_message");
    expect(handle!.sessionManager.activeSessionCount).toBe(1);
  });

  it("routes binary frames using WebSocket frame metadata instead of JSON parsing", async () => {
    const { port } = await startServer();
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_json_like",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 3,
        },
      }),
    );

    const response = await sendRawAndReceive(ws, Buffer.from("{}"), {
      binary: true,
      timeoutMs: 500,
    });

    expect(response.type).toBe("error");
    expect((response.payload as Record<string, unknown>).code).toBe("audio_byte_length_mismatch");
  });

  it("emits transcript events after a valid audio frame pair", async () => {
    const sttAdapter: SttAdapter = {
      async transcribeChunk(input) {
        return {
          events: [
            {
              type: "transcript.partial",
              payload: {
                segment_id: `seg_${input.meta.chunk_id}_partial`,
                speaker: "user",
                text: "hello from adapter",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.72,
              },
            },
            {
              type: "transcript.final",
              payload: {
                segment_id: `seg_${input.meta.chunk_id}`,
                speaker: "user",
                text: "hello from adapter",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.91,
              },
            },
          ],
          telemetry: [],
        };
      },
    };

    const { port } = await startServer({ sttAdapter });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "session.start",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          workspace_id: "ws_test_1",
          meeting_source: "test",
          capture: { microphone: true, system_audio: false, screen_context: false },
          processing: { stt: "cloud", llm: "cloud", retrieval: "cloud" },
        },
      }),
    );

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 3,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_transcript_1",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 250,
          byte_length: 4,
        },
      }),
    );

    const transcriptMessages = receiveJsonMessages(ws, 2, 500);
    ws.send(Buffer.from([1, 2, 3, 4]), { binary: true });
    const [partial, final] = await transcriptMessages;
    if (partial === undefined || final === undefined) {
      throw new Error("Expected partial and final transcript messages");
    }

    expect(partial.type).toBe("transcript.partial");
    expect(partial.seq).toBe(2);
    expect(partial.session_id).toBe(sessionId);
    expect((partial.payload as Record<string, unknown>).text).toBe("hello from adapter");

    expect(final.type).toBe("transcript.final");
    expect(final.seq).toBe(3);
    expect(final.session_id).toBe(sessionId);
    expect((final.payload as Record<string, unknown>).confidence).toBe(0.91);

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 4,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 4,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
    expect(closedResponse.seq).toBe(4);
    expect((closedResponse.payload as Record<string, unknown>).final_server_seq).toBe(4);
  });

  it("persists emitted final transcript events to the transcript timeline sink", async () => {
    const transcriptTimelineSink = createRecordingTranscriptSink();
    const sttAdapter: SttAdapter = {
      async transcribeChunk(input) {
        return {
          events: [
            {
              type: "transcript.partial",
              payload: {
                segment_id: "seg_persist",
                speaker: "user",
                text: "live partial",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.7,
              },
            },
            {
              type: "transcript.final",
              payload: {
                segment_id: "seg_persist",
                speaker: "user",
                text: "durable final",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.91,
              },
            },
          ],
          telemetry: [],
        };
      },
    };

    const { port } = await startServer({ sttAdapter, transcriptTimelineSink });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_persist",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 250,
          byte_length: 2,
        },
      }),
    );

    const messages = receiveJsonMessages(ws, 2, 500);
    ws.send(Buffer.from([1, 2]), { binary: true });
    await messages;

    expect(transcriptTimelineSink.transcriptWrites).toHaveLength(1);
    expect(transcriptTimelineSink.transcriptWrites[0]?.workspaceId).toBe("ws_test_1");
    expect(transcriptTimelineSink.transcriptWrites[0]?.sessionId).toBe(sessionId);
    expect(transcriptTimelineSink.transcriptWrites[0]?.event.type).toBe("transcript.final");
    expect(transcriptTimelineSink.transcriptWrites[0]?.event.payload.text).toBe("durable final");
  });

  it.each<TranscriptRetentionMode>(["live_only", "local_only"])(
    "streams final transcript events without cloud timeline persistence for %s",
    async (transcriptRetentionMode) => {
      const transcriptTimelineSink = createRecordingTranscriptSink();
      const sttAdapter: SttAdapter = {
        async transcribeChunk(input) {
          return {
            events: [
              {
                type: "transcript.final",
                payload: {
                  segment_id: "seg_no_storage",
                  speaker: "user",
                  text: "live final only",
                  start_ms: input.meta.timestamp_ms,
                  end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                  confidence: 0.91,
                },
              },
            ],
            telemetry: [],
          };
        },
      };

      const { port } = await startServer({
        sttAdapter,
        transcriptTimelineSink,
        transcriptRetentionMode,
      });
      const ws = await connect(port);

      const authResponse = await sendAndReceive(ws, {
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "auth.hello",
        seq: 1,
        sent_at: new Date().toISOString(),
        payload: {
          token: "valid_token",
          client_version: "0.1.0",
          platform: "windows",
          device_id: "dev_test_1",
        },
      });
      const sessionId = authResponse.session_id as string;

      ws.send(
        JSON.stringify({
          protocol_version: REALTIME_PROTOCOL_VERSION,
          type: "audio.chunk_meta",
          seq: 2,
          session_id: sessionId,
          sent_at: new Date().toISOString(),
          payload: {
            chunk_id: "aud_no_storage",
            chunk_index: 0,
            stream: "microphone",
            format: "pcm_s16le",
            sample_rate_hz: 16000,
            channels: 1,
            duration_ms: 100,
            timestamp_ms: 250,
            byte_length: 2,
          },
        }),
      );

      const transcript = receiveJson(ws, 500);
      ws.send(Buffer.from([1, 2]), { binary: true });

      expect((await transcript).type).toBe("transcript.final");
      expect(transcriptTimelineSink.transcriptWrites).toEqual([]);
    },
  );

  it("does not persist partial transcript events", async () => {
    const transcriptTimelineSink = createRecordingTranscriptSink();
    const sttAdapter: SttAdapter = {
      async transcribeChunk(input) {
        return {
          events: [
            {
              type: "transcript.partial",
              payload: {
                segment_id: "seg_partial_only",
                speaker: "user",
                text: "partial only",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.7,
              },
            },
          ],
          telemetry: [],
        };
      },
    };

    const { port } = await startServer({ sttAdapter, transcriptTimelineSink });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_partial_only",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 2,
        },
      }),
    );

    const transcript = receiveJson(ws, 500);
    ws.send(Buffer.from([1, 2]), { binary: true });
    expect((await transcript).type).toBe("transcript.partial");
    expect(transcriptTimelineSink.transcriptWrites).toEqual([]);
  });

  it("suppresses duplicate final and stale partial transcript events before sending", async () => {
    const sttAdapter: SttAdapter = {
      async transcribeChunk(input) {
        return {
          events: [
            {
              type: "transcript.partial",
              payload: {
                segment_id: "seg_duplicate",
                speaker: "user",
                text: "partial",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.72,
              },
            },
            {
              type: "transcript.final",
              payload: {
                segment_id: "seg_duplicate",
                speaker: "user",
                text: "final",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.91,
              },
            },
            {
              type: "transcript.final",
              payload: {
                segment_id: "seg_duplicate",
                speaker: "user",
                text: "final duplicate",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.91,
              },
            },
            {
              type: "transcript.partial",
              payload: {
                segment_id: "seg_duplicate",
                speaker: "user",
                text: "late partial",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.8,
              },
            },
          ],
          telemetry: [],
        };
      },
    };

    const { port } = await startServer({ sttAdapter });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_duplicate",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 2,
        },
      }),
    );

    const transcriptMessages = receiveJsonMessages(ws, 2, 500);
    ws.send(Buffer.from([1, 2]), { binary: true });
    const [partial, final] = await transcriptMessages;
    if (partial === undefined || final === undefined) {
      throw new Error("Expected partial and final transcript messages");
    }

    expect(partial.type).toBe("transcript.partial");
    expect(final.type).toBe("transcript.final");
    expect((final.payload as Record<string, unknown>).text).toBe("final");

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
  });

  it("persists duplicate final transcript events only once after processor suppression", async () => {
    const transcriptTimelineSink = createRecordingTranscriptSink();
    const sttAdapter: SttAdapter = {
      async transcribeChunk(input) {
        return {
          events: [
            {
              type: "transcript.final",
              payload: {
                segment_id: "seg_duplicate_persist",
                speaker: "user",
                text: "first final",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.91,
              },
            },
            {
              type: "transcript.final",
              payload: {
                segment_id: "seg_duplicate_persist",
                speaker: "user",
                text: "duplicate final",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.92,
              },
            },
          ],
          telemetry: [],
        };
      },
    };

    const { port } = await startServer({ sttAdapter, transcriptTimelineSink });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_duplicate_persist",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 2,
        },
      }),
    );

    const transcript = receiveJson(ws, 500);
    ws.send(Buffer.from([1, 2]), { binary: true });
    expect((await transcript).type).toBe("transcript.final");
    await expect(receiveJson(ws, 200)).rejects.toThrow("Timeout waiting for response");

    expect(transcriptTimelineSink.transcriptWrites).toHaveLength(1);
    expect(transcriptTimelineSink.transcriptWrites[0]?.event.payload.text).toBe("first final");
  });

  it("persists audio gap messages in the transcript timeline", async () => {
    const transcriptTimelineSink = createRecordingTranscriptSink();
    const { port } = await startServer({ transcriptTimelineSink });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.gap",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          stream: "microphone",
          start_ms: 1200,
          end_ms: 1800,
          dropped_chunks: 6,
          reason: "local_buffer_full",
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(transcriptTimelineSink.gapWrites).toEqual([
      {
        workspaceId: "ws_test_1",
        sessionId,
        stream: "microphone",
        startMs: 1200,
        endMs: 1800,
        droppedChunks: 6,
        reason: "local_buffer_full",
      },
    ]);
  });

  it.each<TranscriptRetentionMode>(["live_only", "local_only"])(
    "skips audio gap persistence for %s retention",
    async (transcriptRetentionMode) => {
      const transcriptTimelineSink = createRecordingTranscriptSink();
      const { port } = await startServer({
        transcriptTimelineSink,
        transcriptRetentionMode,
      });
      const ws = await connect(port);

      const authResponse = await sendAndReceive(ws, {
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "auth.hello",
        seq: 1,
        sent_at: new Date().toISOString(),
        payload: {
          token: "valid_token",
          client_version: "0.1.0",
          platform: "windows",
          device_id: "dev_test_1",
        },
      });
      const sessionId = authResponse.session_id as string;

      ws.send(
        JSON.stringify({
          protocol_version: REALTIME_PROTOCOL_VERSION,
          type: "audio.gap",
          seq: 2,
          session_id: sessionId,
          sent_at: new Date().toISOString(),
          payload: {
            stream: "microphone",
            start_ms: 1200,
            end_ms: 1800,
            dropped_chunks: 6,
            reason: "local_buffer_full",
          },
        }),
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(transcriptTimelineSink.gapWrites).toEqual([]);
    },
  );

  it("keeps the session open and emits a recoverable error when transcript persistence fails", async () => {
    const transcriptTimelineSink: TranscriptTimelineSink = {
      async recordTranscriptEvent() {
        throw new Error("database unavailable with transcript content");
      },
      async recordGap() {
        return { status: "recorded", telemetry: [] };
      },
      getSnapshot(workspaceId, sessionId) {
        return { workspaceId, sessionId, segments: [], gaps: [] };
      },
    };
    const sttAdapter: SttAdapter = {
      async transcribeChunk(input) {
        return {
          events: [
            {
              type: "transcript.final",
              payload: {
                segment_id: "seg_persist_fail",
                speaker: "user",
                text: "do not leak me",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.91,
              },
            },
          ],
          telemetry: [],
        };
      },
    };

    const { port } = await startServer({ sttAdapter, transcriptTimelineSink });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_persist_fail",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 2,
        },
      }),
    );

    const messages = receiveJsonMessages(ws, 2, 500);
    ws.send(Buffer.from([1, 2]), { binary: true });
    const received = await messages;

    expect(received.map((message) => message.type)).toEqual(["transcript.final", "error"]);
    const errorPayload = received[1]?.payload as Record<string, unknown>;
    expect(errorPayload.code).toBe("transcript_persistence_failed");
    expect(errorPayload.recoverable).toBe(true);
    expect(JSON.stringify(received[1])).not.toContain("do not leak me");

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });
    expect(closedResponse.type).toBe("session.closed");
  });

  it("drops delayed STT transcript events after session.end", async () => {
    let resolveStt:
      | ((result: Awaited<ReturnType<SttAdapter["transcribeChunk"]>>) => void)
      | undefined;
    const sttAdapter: SttAdapter = {
      async transcribeChunk(input) {
        return new Promise((resolve) => {
          resolveStt = resolve;
        }).then(() => ({
          events: [
            {
              type: "transcript.final" as const,
              payload: {
                segment_id: "seg_delayed",
                speaker: "user" as const,
                text: "delayed final",
                start_ms: input.meta.timestamp_ms,
                end_ms: input.meta.timestamp_ms + input.meta.duration_ms,
                confidence: 0.91,
              },
            },
          ],
          telemetry: [],
        }));
      },
    };

    const { port } = await startServer({ sttAdapter });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_delayed",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 2,
        },
      }),
    );
    ws.send(Buffer.from([1, 2]), { binary: true });

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
    expect(resolveStt).toBeDefined();
    resolveStt?.({
      events: [],
      telemetry: [],
    });

    await expect(receiveJson(ws, 200)).rejects.toThrow("Timeout waiting for response");
  });

  it("keeps the session open and emits a recoverable error when STT fails", async () => {
    const sttAdapter: SttAdapter = {
      async transcribeChunk() {
        return {
          error: {
            code: "stt_provider_timeout",
            message: "Transcription provider timed out.",
            recoverable: true,
            retry_after_ms: 2000,
          },
          telemetry: [],
        };
      },
    };

    const { port } = await startServer({ sttAdapter });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_timeout",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 2,
        },
      }),
    );

    const response = await sendRawAndReceive(ws, Buffer.from([1, 2]), {
      binary: true,
      timeoutMs: 500,
    });

    expect(response.type).toBe("error");
    const payload = response.payload as Record<string, unknown>;
    expect(payload.code).toBe("stt_provider_timeout");
    expect(payload.recoverable).toBe(true);
    expect(payload.retry_after_ms).toBe(2000);

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
  });

  it("uses one STT session for multiple audio chunks", async () => {
    const starts: SttSessionStartInput[] = [];
    const chunks: string[] = [];
    const closes: SttSessionCloseReason[] = [];
    const sttAdapter: SttAdapter & {
      startSession(input: SttSessionStartInput): Promise<SttSession>;
    } = {
      async startSession(input) {
        starts.push(input);
        return {
          async transcribeChunk(chunkInput) {
            chunks.push(chunkInput.meta.chunk_id);
            return {
              events: [
                {
                  type: "transcript.final",
                  payload: {
                    segment_id: `seg_${chunkInput.meta.chunk_id}`,
                    speaker: "user",
                    text: `chunk ${chunkInput.meta.chunk_index}`,
                    start_ms: chunkInput.meta.timestamp_ms,
                    end_ms: chunkInput.meta.timestamp_ms + chunkInput.meta.duration_ms,
                    confidence: 0.91,
                  },
                },
              ],
              telemetry: [],
            };
          },
          async close(reason) {
            closes.push(reason);
          },
        };
      },
      async transcribeChunk() {
        throw new Error("Expected server to use session-scoped STT");
      },
    };

    const { port } = await startServer({ sttAdapter });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    for (const [index, chunkId] of ["aud_session_1", "aud_session_2"].entries()) {
      ws.send(
        JSON.stringify({
          protocol_version: REALTIME_PROTOCOL_VERSION,
          type: "audio.chunk_meta",
          seq: index + 2,
          session_id: sessionId,
          sent_at: new Date().toISOString(),
          payload: {
            chunk_id: chunkId,
            chunk_index: index,
            stream: "microphone",
            format: "pcm_s16le",
            sample_rate_hz: 16000,
            channels: 1,
            duration_ms: 100,
            timestamp_ms: index * 100,
            byte_length: 2,
          },
        }),
      );

      const transcript = receiveJson(ws, 500);
      ws.send(Buffer.from([1, 2]), { binary: true });
      expect((await transcript).type).toBe("transcript.final");
    }

    expect(starts).toHaveLength(1);
    expect(starts[0]?.sessionId).toBe(sessionId);
    expect(starts[0]?.workspaceId).toBe("ws_test_1");
    expect(chunks).toEqual(["aud_session_1", "aud_session_2"]);

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 4,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 4,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
    expect(closes).toEqual(["session.end"]);
  });

  it("emits asynchronous STT session transcript callbacks through the processor", async () => {
    let callbacks: SttSessionStartInput | undefined;
    const sttAdapter: SttAdapter & {
      startSession(input: SttSessionStartInput): Promise<SttSession>;
    } = {
      async startSession(input) {
        callbacks = input;
        return {
          async transcribeChunk() {
            return { events: [], telemetry: [] };
          },
          async close() {},
        };
      },
      async transcribeChunk() {
        throw new Error("Expected server to use session-scoped STT");
      },
    };

    const { port } = await startServer({ sttAdapter });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_async",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 2,
        },
      }),
    );
    ws.send(Buffer.from([1, 2]), { binary: true });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callbacks).toBeDefined();
    const transcriptEvent: SttTranscriptEvent = {
      type: "transcript.final",
      payload: {
        segment_id: "seg_async",
        speaker: "user",
        text: "async final",
        start_ms: 0,
        end_ms: 100,
        confidence: 0.91,
      },
    };

    const transcript = receiveJson(ws, 500);
    callbacks?.emitTranscriptEvents([transcriptEvent]);
    const response = await transcript;

    expect(response.type).toBe("transcript.final");
    expect((response.payload as Record<string, unknown>).text).toBe("async final");

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });
    expect(closedResponse.type).toBe("session.closed");

    callbacks?.emitTranscriptEvents([
      {
        ...transcriptEvent,
        payload: { ...transcriptEvent.payload, segment_id: "seg_after_close" },
      },
    ]);
    await expect(receiveJson(ws, 200)).rejects.toThrow("Timeout waiting for response");
  });

  it("emits recoverable errors from asynchronous STT session callbacks", async () => {
    let callbacks: SttSessionStartInput | undefined;
    const sttAdapter: SttAdapter & {
      startSession(input: SttSessionStartInput): Promise<SttSession>;
    } = {
      async startSession(input) {
        callbacks = input;
        return {
          async transcribeChunk() {
            return { events: [], telemetry: [] };
          },
          async close() {},
        };
      },
      async transcribeChunk() {
        throw new Error("Expected server to use session-scoped STT");
      },
    };

    const { port } = await startServer({ sttAdapter });
    const ws = await connect(port);

    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    const sessionId = authResponse.session_id as string;

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "audio.chunk_meta",
        seq: 2,
        session_id: sessionId,
        sent_at: new Date().toISOString(),
        payload: {
          chunk_id: "aud_async_error",
          chunk_index: 0,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 0,
          byte_length: 2,
        },
      }),
    );
    ws.send(Buffer.from([1, 2]), { binary: true });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const errorMessage = receiveJson(ws, 500);
    callbacks?.emitError({
      code: "stt_provider_timeout",
      message: "Transcription provider timed out.",
      recoverable: true,
      retry_after_ms: 2000,
    });

    const response = await errorMessage;
    expect(response.type).toBe("error");
    expect((response.payload as Record<string, unknown>).code).toBe("stt_provider_timeout");

    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 3,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 3,
      },
    });
    expect(closedResponse.type).toBe("session.closed");
  });

  it("tracks active sessions in the session manager", async () => {
    const { port } = await startServer();
    expect(handle!.sessionManager.activeSessionCount).toBe(0);

    const ws = await connect(port);
    await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });

    expect(handle!.sessionManager.activeSessionCount).toBe(1);

    ws.close();
    // Wait for close to propagate
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(handle!.sessionManager.activeSessionCount).toBe(0);
  });
});
