import { describe, expect, it } from "vitest";
import { REALTIME_PROTOCOL_VERSION } from "@dokeza/contracts";
import { RealtimeFrameAssembler } from "./frame-assembler.js";

const base = {
  protocol_version: REALTIME_PROTOCOL_VERSION,
  seq: 1,
  session_id: "sess_123",
  sent_at: "2026-06-13T00:00:00.000Z",
};

const audioMeta = {
  ...base,
  type: "audio.chunk_meta",
  payload: {
    chunk_id: "aud_123",
    chunk_index: 0,
    stream: "microphone",
    format: "pcm_s16le",
    sample_rate_hz: 16000,
    channels: 1,
    duration_ms: 100,
    timestamp_ms: 0,
    byte_length: 4,
  },
};

describe("RealtimeFrameAssembler", () => {
  it("accepts a strict audio metadata and binary payload pair", () => {
    const assembler = new RealtimeFrameAssembler();

    expect(assembler.handleJsonMessage(audioMeta).type).toBe("audio.chunk_meta_accepted");
    const event = assembler.handleBinaryFrame(new Uint8Array([1, 2, 3, 4]));

    expect(event.type).toBe("audio.chunk");
    if (event.type === "audio.chunk") {
      expect(event.meta.chunk_id).toBe("aud_123");
      expect(event.telemetry.fields).not.toHaveProperty("chunk_id");
    }
  });

  it("rejects a binary payload without metadata", () => {
    const assembler = new RealtimeFrameAssembler();

    expect(assembler.handleBinaryFrame(new Uint8Array([1]))).toEqual({
      type: "error",
      code: "unexpected_binary_payload",
      recoverable: true,
    });
  });

  it("rejects missing binary payload before the next JSON message", () => {
    const assembler = new RealtimeFrameAssembler();

    assembler.handleJsonMessage(audioMeta);
    expect(
      assembler.handleJsonMessage({
        ...base,
        seq: 2,
        type: "session.end",
        payload: {
          reason: "user_stopped",
          last_client_seq: 1,
        },
      }),
    ).toEqual({
      type: "error",
      code: "missing_binary_payload",
      recoverable: true,
    });
  });

  it("records audio gaps without logging transcript or audio content", () => {
    const assembler = new RealtimeFrameAssembler();

    const event = assembler.handleJsonMessage({
      ...base,
      type: "audio.gap",
      payload: {
        stream: "microphone",
        start_ms: 100,
        end_ms: 200,
        dropped_chunks: 2,
        reason: "local_buffer_full",
      },
    });

    expect(event.type).toBe("audio.gap");
    if (event.type === "audio.gap") {
      expect(event.telemetry.fields).toEqual({
        stream: "microphone",
        droppedChunks: 2,
        reason: "local_buffer_full",
      });
    }
  });
});
