import { describe, expect, it } from "vitest";
import { getOverlayView } from "./overlayViewModel.js";

describe("overlayViewModel", () => {
  it("shows reconnect capture state with buffered audio metadata", () => {
    expect(
      getOverlayView({
        status: "reconnecting",
        lastClientSeq: 4,
        lastServerSeq: 3,
        nextReconnectDelayMs: 1000,
        pendingAudioChunks: 2,
        transcripts: [],
        suggestions: [],
      }),
    ).toEqual({
      tone: "warning",
      title: "Reconnecting",
      meta: "capture paused / 1000 ms / 2 chunks buffered",
    });
  });

  it("shows suggestion unavailable state without content", () => {
    expect(
      getOverlayView({
        status: "degraded",
        lastClientSeq: 4,
        lastServerSeq: 3,
        transcripts: [],
        suggestions: [],
        lastError: {
          code: "llm_provider_timeout",
          message: "Provider timed out with restricted content omitted.",
          recoverable: true,
        },
      }),
    ).toEqual({
      tone: "warning",
      title: "Suggestions unavailable",
      meta: "Degraded",
    });
  });

  it("shows transcript and suggestion count during streaming", () => {
    expect(
      getOverlayView({
        status: "streaming",
        lastClientSeq: 4,
        lastServerSeq: 3,
        transcripts: [
          {
            segmentId: "seg_1",
            speaker: "user",
            text: "Can we use annual billing?",
            startMs: 0,
            endMs: 1000,
            confidence: 0.9,
            final: false,
          },
        ],
        suggestions: [
          {
            suggestionId: "sug_1",
            requestId: "req_1",
            kind: "answer_question",
            content: "Yes",
            status: "complete",
            sources: [],
          },
        ],
      }),
    ).toEqual({
      tone: "ok",
      title: "Can we use annual billing?",
      meta: "user / partial / 1 suggestions",
    });
  });
});
