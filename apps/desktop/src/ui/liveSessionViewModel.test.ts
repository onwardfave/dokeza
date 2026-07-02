import { describe, expect, it } from "vitest";
import {
  getLiveSessionDetail,
  getLiveSessionStatusView,
  toLiveTranscriptRows,
} from "./liveSessionViewModel.js";

describe("live session view model", () => {
  it("maps realtime states to visible labels and tones", () => {
    expect(getLiveSessionStatusView("streaming")).toEqual({
      label: "Streaming",
      tone: "ok",
    });
    expect(getLiveSessionStatusView("degraded")).toEqual({
      label: "Degraded",
      tone: "warning",
    });
    expect(getLiveSessionStatusView("failed")).toEqual({
      label: "Failed",
      tone: "danger",
    });
  });

  it("prefers recoverable error details without requiring transcript content", () => {
    expect(
      getLiveSessionDetail({
        status: "degraded",
        sessionId: "sess_1",
        connectionId: "conn_1",
        lastClientSeq: 4,
        lastServerSeq: 3,
        transcripts: [],
        lastError: {
          code: "stt_provider_timeout",
          message: "Transcription provider timed out.",
          recoverable: true,
        },
      }),
    ).toBe("Transcription provider timed out.");
  });

  it("formats transcript rows for the product UI", () => {
    expect(
      toLiveTranscriptRows([
        {
          segmentId: "seg_1",
          speaker: "user",
          text: "hello",
          startMs: 0,
          endMs: 100,
          confidence: 0.91,
          final: true,
        },
      ]),
    ).toEqual([
      {
        id: "seg_1",
        speaker: "user",
        text: "hello",
        state: "final",
      },
    ]);
  });
});
