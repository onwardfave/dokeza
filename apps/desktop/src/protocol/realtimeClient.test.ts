import { describe, expect, it } from "vitest";
import {
  createAudioGapMessage,
  createAuthHelloMessage,
  createAudioChunkMetaMessage,
  createInitialRealtimeClientState,
  createResumeRequestMessage,
  createSessionEndMessage,
  createSessionStartMessage,
  createSuggestionRequestMessage,
  createSyntheticPcmChunks,
} from "./realtimeClient.js";

describe("desktop realtime protocol client", () => {
  it("creates auth.hello as the first protocol message", () => {
    const state = createInitialRealtimeClientState();
    const message = createAuthHelloMessage(state, {
      token: "dev_token",
      clientVersion: "0.1.0",
      platform: "windows",
      deviceId: "dev_123",
    });

    expect(message.type).toBe("auth.hello");
    expect(message.seq).toBe(1);
    expect(message.session_id).toBeUndefined();
    if (message.type === "auth.hello") {
      expect(message.payload).toMatchObject({
        token: "dev_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_123",
      });
    }
  });

  it("creates a valid session.start message with cloud processing defaults", () => {
    const state = createInitialRealtimeClientState();
    createAuthHelloMessage(state, {
      token: "dev_token",
      clientVersion: "0.1.0",
      platform: "windows",
      deviceId: "dev_123",
    });

    const message = createSessionStartMessage(state, {
      sessionId: "sess_123",
      workspaceId: "ws_123",
      deviceId: "dev_123",
    });

    expect(message.type).toBe("session.start");
    expect(message.seq).toBe(2);
    if (message.type === "session.start") {
      expect(message.payload.processing).toEqual({
        stt: "cloud",
        llm: "cloud",
        retrieval: "cloud",
      });
    }
  });

  it("creates audio metadata that must be paired with one binary frame", () => {
    const state = createInitialRealtimeClientState();
    state.nextSeq = 3;
    const message = createAudioChunkMetaMessage(state, "sess_123", {
      chunk_id: "aud_123",
      chunk_index: 0,
      stream: "microphone",
      format: "pcm_s16le",
      sample_rate_hz: 16000,
      channels: 1,
      duration_ms: 100,
      timestamp_ms: 0,
      byte_length: 3200,
    });

    expect(message.type).toBe("audio.chunk_meta");
    expect(message.seq).toBe(3);
    expect(message.payload.byte_length).toBe(3200);
  });

  it("creates audio.gap metadata for dropped buffered audio", () => {
    const state = createInitialRealtimeClientState();
    state.nextSeq = 5;

    const message = createAudioGapMessage(state, "sess_123", {
      stream: "microphone",
      start_ms: 100,
      end_ms: 300,
      dropped_chunks: 2,
      reason: "local_buffer_full",
    });

    expect(message.type).toBe("audio.gap");
    expect(message.seq).toBe(5);
    expect(message.payload).toEqual({
      stream: "microphone",
      start_ms: 100,
      end_ms: 300,
      dropped_chunks: 2,
      reason: "local_buffer_full",
    });
  });

  it("creates session.end with the last client sequence in the payload", () => {
    const state = createInitialRealtimeClientState();
    state.nextSeq = 8;

    const message = createSessionEndMessage(state, "sess_123", "user_stopped");

    expect(message.type).toBe("session.end");
    expect(message.seq).toBe(8);
    if (message.type === "session.end") {
      expect(message.payload.last_client_seq).toBe(8);
    }
  });

  it("creates resume.request with previous connection and sequence recovery state", () => {
    const state = createInitialRealtimeClientState();
    state.nextSeq = 12;

    const message = createResumeRequestMessage(state, {
      sessionId: "sess_123",
      previousConnectionId: "conn_old",
      lastClientSeq: 11,
      lastServerSeq: 9,
    });

    expect(message.type).toBe("resume.request");
    expect(message.seq).toBe(12);
    if (message.type === "resume.request") {
      expect(message.payload).toEqual({
        previous_connection_id: "conn_old",
        last_client_seq: 11,
        last_server_seq: 9,
      });
    }
  });

  it("creates manual suggestion.request messages without requiring source retrieval", () => {
    const state = createInitialRealtimeClientState();
    state.nextSeq = 15;

    const message = createSuggestionRequestMessage(state, {
      sessionId: "sess_123",
      requestId: "sreq_123",
      kind: "answer_question",
      userPrompt: "Suggest an answer",
      includeSources: false,
    });

    expect(message.type).toBe("suggestion.request");
    expect(message.seq).toBe(15);
    if (message.type === "suggestion.request") {
      expect(message.payload).toEqual({
        request_id: "sreq_123",
        kind: "answer_question",
        user_prompt: "Suggest an answer",
        include_sources: false,
      });
    }
  });

  it("generates deterministic synthetic PCM chunks", () => {
    const chunks = createSyntheticPcmChunks({
      chunkCount: 2,
      samplesPerChunk: 4,
      amplitude: 1200,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.meta).toMatchObject({
      chunk_id: "synthetic_0",
      chunk_index: 0,
      stream: "microphone",
      format: "pcm_s16le",
      sample_rate_hz: 16000,
      channels: 1,
      duration_ms: 1,
      timestamp_ms: 0,
      byte_length: 8,
    });
    expect(chunks[1]?.meta.chunk_id).toBe("synthetic_1");
    expect(chunks[1]?.meta.timestamp_ms).toBe(1);
    expect(chunks[0]?.bytes).toBeInstanceOf(Uint8Array);
    expect(chunks[0]?.bytes.byteLength).toBe(8);
    expect(Array.from(chunks[0]!.bytes)).toEqual(
      Array.from(
        createSyntheticPcmChunks({
          chunkCount: 1,
          samplesPerChunk: 4,
          amplitude: 1200,
        })[0]!.bytes,
      ),
    );
  });
});
