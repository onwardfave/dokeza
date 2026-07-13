import { describe, expect, it } from "vitest";
import {
  REALTIME_PROTOCOL_VERSION,
  realtimeJsonMessageErrors,
  validateRealtimeJsonMessage,
} from "./realtime.js";

const base = {
  protocol_version: REALTIME_PROTOCOL_VERSION,
  seq: 1,
  session_id: "sess_123",
  sent_at: "2026-06-13T00:00:00.000Z",
};

describe("realtime contracts", () => {
  it("accepts audio chunk metadata from the protocol baseline", () => {
    expect(
      validateRealtimeJsonMessage({
        ...base,
        type: "audio.chunk_meta",
        payload: {
          chunk_id: "aud_123",
          chunk_index: 42,
          stream: "microphone",
          format: "pcm_s16le",
          sample_rate_hz: 16000,
          channels: 1,
          duration_ms: 100,
          timestamp_ms: 4500,
          byte_length: 3200,
        },
      }),
    ).toBe(true);
  });

  it("rejects direct provider STT in accepted policy", () => {
    expect(
      validateRealtimeJsonMessage({
        ...base,
        type: "auth.accepted",
        payload: {
          connection_id: "conn_123",
          workspace_id: "ws_123",
          policy: {
            screen_context_allowed: true,
            cloud_stt_allowed: true,
            cloud_llm_allowed: true,
            direct_provider_stt_allowed: true,
            retention_mode: "30_days",
            max_local_audio_buffer_ms: 300000,
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts explicit dropped-audio gaps", () => {
    expect(
      validateRealtimeJsonMessage({
        ...base,
        type: "audio.gap",
        payload: {
          stream: "microphone",
          start_ms: 120000,
          end_ms: 138000,
          dropped_chunks: 180,
          reason: "local_buffer_full",
        },
      }),
    ).toBe(true);
  });

  it("accepts recoverable transcript persistence failures", () => {
    expect(
      validateRealtimeJsonMessage({
        ...base,
        type: "error",
        payload: {
          code: "transcript_persistence_failed",
          message: "Transcript persistence failed.",
          recoverable: true,
        },
      }),
    ).toBe(true);
  });

  it("accepts recoverable session persistence failures", () => {
    expect(
      validateRealtimeJsonMessage({
        ...base,
        type: "error",
        payload: {
          code: "session_persistence_failed",
          message: "Session persistence failed.",
          recoverable: true,
        },
      }),
    ).toBe(true);
  });

  it("accepts recoverable feature unavailable errors", () => {
    expect(
      validateRealtimeJsonMessage({
        ...base,
        type: "error",
        payload: {
          code: "feature_unavailable",
          message: "Feature is not available in this milestone.",
          recoverable: true,
        },
      }),
    ).toBe(true);
  });

  it("accepts recoverable suggestion rate limit errors", () => {
    expect(
      validateRealtimeJsonMessage({
        ...base,
        type: "error",
        payload: {
          code: "suggestion_rate_limited",
          message: "Live suggestion requests are rate limited.",
          recoverable: true,
          retry_after_ms: 1500,
        },
      }),
    ).toBe(true);
  });

  it("accepts recoverable LLM provider timeout errors", () => {
    expect(
      validateRealtimeJsonMessage({
        ...base,
        type: "error",
        payload: {
          code: "llm_provider_timeout",
          message: "Live suggestions are temporarily unavailable.",
          recoverable: true,
          retry_after_ms: 2000,
        },
      }),
    ).toBe(true);
  });

  it.each(["suggestion_budget_exceeded", "usage_persistence_failed"])(
    "accepts recoverable %s errors",
    (code) => {
      expect(
        validateRealtimeJsonMessage({
          ...base,
          type: "error",
          payload: {
            code,
            message: "Live suggestions are unavailable.",
            recoverable: true,
          },
        }),
      ).toBe(true);
    },
  );

  it("reports schema errors without exposing message payload content", () => {
    const errors = realtimeJsonMessageErrors({
      ...base,
      type: "audio.chunk_meta",
      payload: {
        chunk_id: "aud_123",
        chunk_index: -1,
        stream: "microphone",
        format: "pcm_s16le",
        sample_rate_hz: 44100,
        channels: 2,
        duration_ms: 0,
        timestamp_ms: 4500,
        byte_length: 0,
      },
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(" ")).not.toContain("aud_123");
  });
});
