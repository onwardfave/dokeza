import { describe, expect, it } from "vitest";
import { DeterministicSttAdapter } from "./stt-adapter.js";

describe("DeterministicSttAdapter", () => {
  it("returns transcript events with metadata-only telemetry", async () => {
    const adapter = new DeterministicSttAdapter({
      transcriptText: "synthetic transcript text",
    });

    const result = await adapter.transcribeChunk({
      sessionId: "sess_test",
      workspaceId: "ws_test",
      meta: {
        chunk_id: "aud_test",
        chunk_index: 0,
        stream: "microphone",
        format: "pcm_s16le",
        sample_rate_hz: 16000,
        channels: 1,
        duration_ms: 100,
        timestamp_ms: 0,
        byte_length: 2,
      },
      bytes: new Uint8Array([1, 2]),
    });

    expect("events" in result).toBe(true);
    if (!("events" in result)) throw new Error("Expected transcript events");

    expect(result.events.map((event) => event.type)).toEqual([
      "transcript.partial",
      "transcript.final",
    ]);
    expect(result.events[1]?.payload.text).toBe("synthetic transcript text");

    const telemetryJson = JSON.stringify(result.telemetry);
    expect(telemetryJson).not.toContain("synthetic transcript text");
    expect(telemetryJson).not.toContain("[1,2]");
    expect(telemetryJson).not.toContain("bytes");
  });
});
