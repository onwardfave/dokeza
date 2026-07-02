import { REALTIME_PROTOCOL_VERSION, type RealtimeJsonMessage } from "@dokeza/contracts";
import { describe, expect, it } from "vitest";
import {
  BrowserRealtimeTransportFactory,
  DesktopRealtimeSessionClient,
  type RealtimeScheduler,
  type RealtimeTransport,
  type RealtimeTransportHandlers,
} from "./desktopRealtimeSession.js";
import { createSyntheticPcmChunks } from "./realtimeClient.js";

class FakeTransport implements RealtimeTransport {
  readonly textFrames: string[] = [];
  readonly binaryFrames: Uint8Array[] = [];
  closed = false;

  constructor(private readonly handlers: RealtimeTransportHandlers) {}

  sendText(frame: string): void {
    this.textFrames.push(frame);
  }

  sendBinary(frame: Uint8Array): void {
    this.binaryFrames.push(frame);
  }

  close(): void {
    this.closed = true;
    this.handlers.onClose();
  }

  open(): void {
    this.handlers.onOpen();
  }

  receive(message: RealtimeJsonMessage): void {
    this.handlers.onTextMessage(JSON.stringify(message));
  }

  fail(error: Error): void {
    this.handlers.onError(error);
  }
}

class FakeTransportFactory {
  transport: FakeTransport | undefined;
  readonly transports: FakeTransport[] = [];
  connectedUrl: string | undefined;

  connect(url: string, handlers: RealtimeTransportHandlers): RealtimeTransport {
    this.connectedUrl = url;
    this.transport = new FakeTransport(handlers);
    this.transports.push(this.transport);
    return this.transport;
  }
}

class FakeScheduler implements RealtimeScheduler {
  readonly delays: number[] = [];
  private readonly callbacks: Array<() => void> = [];

  setTimeout(callback: () => void, delayMs: number): number {
    this.delays.push(delayMs);
    this.callbacks.push(callback);
    return this.callbacks.length;
  }

  clearTimeout(): void {}

  runNext(): void {
    this.callbacks.shift()?.();
  }
}

function authAccepted(sessionId = "sess_1", connectionId = "conn_1"): RealtimeJsonMessage {
  return {
    protocol_version: REALTIME_PROTOCOL_VERSION,
    type: "auth.accepted",
    seq: 1,
    session_id: sessionId,
    sent_at: new Date().toISOString(),
    payload: {
      connection_id: connectionId,
      workspace_id: "ws_1",
      policy: {
        screen_context_allowed: true,
        cloud_stt_allowed: true,
        direct_provider_stt_allowed: false,
        retention_mode: "7_days",
        max_local_audio_buffer_ms: 300000,
      },
    },
  };
}

function transcriptFinal(seq: number, text: string): RealtimeJsonMessage {
  return {
    protocol_version: REALTIME_PROTOCOL_VERSION,
    type: "transcript.final",
    seq,
    session_id: "sess_1",
    sent_at: new Date().toISOString(),
    payload: {
      segment_id: `seg_${seq}`,
      speaker: "user",
      text,
      start_ms: 0,
      end_ms: 100,
      confidence: 0.91,
    },
  };
}

function createClient(factory = new FakeTransportFactory()): {
  client: DesktopRealtimeSessionClient;
  factory: FakeTransportFactory;
} {
  return {
    factory,
    client: new DesktopRealtimeSessionClient({
      endpoint: "ws://127.0.0.1:3001/realtime",
      token: "dev_token",
      clientVersion: "0.1.0",
      platform: "windows",
      deviceId: "dev_1",
      transportFactory: factory,
      syntheticAudio: {
        chunkCount: 2,
        samplesPerChunk: 4,
        amplitude: 1000,
      },
    }),
  };
}

function createBufferedClient(): {
  client: DesktopRealtimeSessionClient;
  factory: FakeTransportFactory;
  scheduler: FakeScheduler;
} {
  const factory = new FakeTransportFactory();
  const scheduler = new FakeScheduler();
  return {
    factory,
    scheduler,
    client: new DesktopRealtimeSessionClient({
      endpoint: "ws://127.0.0.1:3001/realtime",
      token: "dev_token",
      clientVersion: "0.1.0",
      platform: "windows",
      deviceId: "dev_1",
      transportFactory: factory,
      scheduler,
      syntheticAudio: {
        chunkCount: 0,
      },
      audioBuffer: {
        maxDurationMs: 200,
        maxBytes: 100000,
      },
    }),
  };
}

function sentJson(transport: FakeTransport, index: number): RealtimeJsonMessage {
  return JSON.parse(transport.textFrames[index] ?? "{}") as RealtimeJsonMessage;
}

describe("DesktopRealtimeSessionClient", () => {
  it("authenticates, starts a session, and sends synthetic audio metadata before binary frames", () => {
    const { client, factory } = createClient();

    client.startSyntheticSession();
    expect(factory.connectedUrl).toBe("ws://127.0.0.1:3001/realtime");
    expect(client.snapshot.status).toBe("connecting");

    factory.transport?.open();
    const auth = sentJson(factory.transport!, 0);
    expect(auth.type).toBe("auth.hello");
    expect(auth.seq).toBe(1);

    factory.transport?.receive(authAccepted());

    expect(client.snapshot.status).toBe("streaming");
    expect(client.snapshot.sessionId).toBe("sess_1");
    expect(client.snapshot.connectionId).toBe("conn_1");
    expect(sentJson(factory.transport!, 1).type).toBe("session.start");
    expect(sentJson(factory.transport!, 1).seq).toBe(2);
    expect(sentJson(factory.transport!, 2).type).toBe("audio.chunk_meta");
    expect(sentJson(factory.transport!, 2).seq).toBe(3);
    expect(sentJson(factory.transport!, 3).type).toBe("audio.chunk_meta");
    expect(sentJson(factory.transport!, 3).seq).toBe(4);
    expect(factory.transport?.binaryFrames).toHaveLength(2);
    expect(client.snapshot.lastClientSeq).toBe(4);
  });

  it("stores partial and final transcript messages without losing server sequence", () => {
    const { client, factory } = createClient();
    client.startSyntheticSession();
    factory.transport?.open();
    factory.transport?.receive(authAccepted());

    factory.transport?.receive({
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "transcript.partial",
      seq: 2,
      session_id: "sess_1",
      sent_at: new Date().toISOString(),
      payload: {
        segment_id: "seg_live",
        speaker: "user",
        text: "partial text",
        start_ms: 0,
        end_ms: 100,
        confidence: 0.91,
      },
    });
    factory.transport?.receive({
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "transcript.final",
      seq: 3,
      session_id: "sess_1",
      sent_at: new Date().toISOString(),
      payload: {
        segment_id: "seg_live",
        speaker: "user",
        text: "final text",
        start_ms: 0,
        end_ms: 100,
        confidence: 0.91,
      },
    });

    expect(client.snapshot.lastServerSeq).toBe(3);
    expect(client.snapshot.transcripts).toEqual([
      {
        segmentId: "seg_live",
        speaker: "user",
        text: "final text",
        startMs: 0,
        endMs: 100,
        confidence: 0.91,
        final: true,
      },
    ]);
  });

  it("keeps the session state available on recoverable errors", () => {
    const { client, factory } = createClient();
    client.startSyntheticSession();
    factory.transport?.open();
    factory.transport?.receive(authAccepted());

    factory.transport?.receive({
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "error",
      seq: 2,
      session_id: "sess_1",
      sent_at: new Date().toISOString(),
      payload: {
        code: "stt_provider_timeout",
        message: "Transcription provider timed out.",
        recoverable: true,
        retry_after_ms: 2000,
      },
    });

    expect(client.snapshot.status).toBe("degraded");
    expect(client.snapshot.lastError).toEqual({
      code: "stt_provider_timeout",
      message: "Transcription provider timed out.",
      recoverable: true,
    });
    expect(factory.transport?.closed).toBe(false);
  });

  it("sends session.end and records closed state", () => {
    const { client, factory } = createClient();
    client.startSyntheticSession();
    factory.transport?.open();
    factory.transport?.receive(authAccepted());

    client.stop("user_stopped");
    const endMessage = sentJson(factory.transport!, 4);
    expect(endMessage.type).toBe("session.end");
    expect(endMessage.seq).toBe(5);

    factory.transport?.receive({
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.closed",
      seq: 3,
      session_id: "sess_1",
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        final_server_seq: 3,
      },
    });

    expect(client.snapshot.status).toBe("closed");
  });

  it("builds resume requests from original session and previous connection state", () => {
    const { client, factory } = createClient();
    client.startSyntheticSession();
    factory.transport?.open();
    factory.transport?.receive(authAccepted());
    factory.transport?.receive(transcriptFinal(6, "missed"));
    factory.transport?.close();

    client.resume();
    factory.transport?.open();
    const auth = sentJson(factory.transport!, 0);
    expect(auth.type).toBe("auth.hello");
    factory.transport?.receive(authAccepted("temporary_session", "conn_2"));

    const resume = sentJson(factory.transport!, 1);
    expect(resume.type).toBe("resume.request");
    expect(resume.session_id).toBe("sess_1");
    if (resume.type === "resume.request") {
      expect(resume.payload).toEqual({
        previous_connection_id: "conn_1",
        last_client_seq: 4,
        last_server_seq: 6,
      });
    }
    expect(client.snapshot.status).toBe("reconnecting");
  });

  it("schedules exponential reconnect after an unexpected active-session close", () => {
    const { client, factory, scheduler } = createBufferedClient();

    client.startSyntheticSession();
    factory.transport?.open();
    factory.transport?.receive(authAccepted());
    factory.transport?.close();

    expect(client.snapshot.status).toBe("reconnecting");
    expect(client.snapshot.nextReconnectDelayMs).toBe(1000);
    expect(scheduler.delays).toEqual([1000]);

    scheduler.runNext();
    expect(factory.transports).toHaveLength(2);
    factory.transport?.open();
    expect(sentJson(factory.transport!, 0).type).toBe("auth.hello");
  });

  it("emits audio gaps and buffered audio after resume", () => {
    const { client, factory, scheduler } = createBufferedClient();
    const [first, second, third] = createSyntheticPcmChunks({
      chunkCount: 3,
      samplesPerChunk: 1600,
      amplitude: 1000,
    });
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("Expected synthetic chunks");
    }

    client.startSyntheticSession();
    factory.transport?.open();
    factory.transport?.receive(authAccepted());
    factory.transport?.close();

    client.sendAudioChunk(first);
    client.sendAudioChunk(second);
    client.sendAudioChunk(third);
    expect(client.snapshot.pendingAudioChunks).toBe(2);
    expect(client.snapshot.pendingAudioGaps).toBe(1);

    scheduler.runNext();
    factory.transport?.open();
    factory.transport?.receive(authAccepted("temporary_session", "conn_2"));

    expect(sentJson(factory.transport!, 1).type).toBe("resume.request");
    const gap = sentJson(factory.transport!, 2);
    expect(gap.type).toBe("audio.gap");
    if (gap.type === "audio.gap") {
      expect(gap.payload).toEqual({
        stream: "microphone",
        start_ms: 0,
        end_ms: 100,
        dropped_chunks: 1,
        reason: "local_buffer_full",
      });
    }
    expect(sentJson(factory.transport!, 3).type).toBe("audio.chunk_meta");
    expect(sentJson(factory.transport!, 4).type).toBe("audio.chunk_meta");
    expect(factory.transport?.binaryFrames).toHaveLength(2);
    expect(client.snapshot.pendingAudioChunks).toBe(0);
    expect(client.snapshot.pendingAudioGaps).toBe(0);
  });

  it("sends explicit local capture gaps while streaming", () => {
    const { client, factory } = createBufferedClient();

    client.startSyntheticSession();
    factory.transport?.open();
    factory.transport?.receive(authAccepted());

    client.sendAudioGap({
      stream: "microphone",
      start_ms: 200,
      end_ms: 500,
      dropped_chunks: 3,
      reason: "user_paused_capture",
    });

    const gap = sentJson(factory.transport!, 2);
    expect(gap.type).toBe("audio.gap");
    if (gap.type === "audio.gap") {
      expect(gap.payload).toEqual({
        stream: "microphone",
        start_ms: 200,
        end_ms: 500,
        dropped_chunks: 3,
        reason: "user_paused_capture",
      });
    }
    expect(client.snapshot.pendingAudioGaps).toBe(0);
  });

  it("creates browser WebSocket transports", () => {
    expect(new BrowserRealtimeTransportFactory()).toBeDefined();
  });
});
