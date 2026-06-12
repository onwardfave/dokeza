import { describe, expect, it } from "vitest";
import {
  createAudioChunkMetaMessage,
  createInitialRealtimeClientState,
  createSessionStartMessage
} from "./realtimeClient.js";

describe("desktop realtime protocol client", () => {
  it("creates a valid session.start message with cloud processing defaults", () => {
    const state = createInitialRealtimeClientState();
    const message = createSessionStartMessage(state, {
      sessionId: "sess_123",
      workspaceId: "ws_123",
      deviceId: "dev_123"
    });

    expect(message.type).toBe("session.start");
    expect(message.seq).toBe(0);
    if (message.type === "session.start") {
      expect(message.payload.processing).toEqual({
        stt: "cloud",
        llm: "cloud",
        retrieval: "cloud"
      });
    }
  });

  it("creates audio metadata that must be paired with one binary frame", () => {
    const state = createInitialRealtimeClientState();
    const message = createAudioChunkMetaMessage(state, "sess_123", {
      chunk_id: "aud_123",
      chunk_index: 0,
      stream: "microphone",
      format: "pcm_s16le",
      sample_rate_hz: 16000,
      channels: 1,
      duration_ms: 100,
      timestamp_ms: 0,
      byte_length: 3200
    });

    expect(message.type).toBe("audio.chunk_meta");
    expect(message.payload.byte_length).toBe(3200);
  });
});
