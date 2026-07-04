import { describe, expect, it } from "vitest";
import {
  getLiveSessionDetail,
  getLiveSessionStatusView,
  toLiveSuggestionCards,
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
        suggestions: [],
        lastError: {
          code: "stt_provider_timeout",
          message: "Transcription provider timed out.",
          recoverable: true,
        },
      }),
    ).toBe("Transcription provider timed out.");
  });

  it("summarizes reconnect buffering state", () => {
    expect(
      getLiveSessionDetail({
        status: "reconnecting",
        sessionId: "sess_1",
        connectionId: "conn_1",
        lastClientSeq: 8,
        lastServerSeq: 4,
        pendingAudioChunks: 2,
        pendingAudioGaps: 1,
        nextReconnectDelayMs: 1000,
        transcripts: [],
        suggestions: [],
      }),
    ).toBe("Reconnect in 1000 ms / 2 audio chunks buffered / 1 gap pending");
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

  it("formats live suggestion cards without storing extra content", () => {
    expect(
      toLiveSuggestionCards([
        {
          suggestionId: "sug_1",
          requestId: "sreq_1",
          kind: "answer_question",
          content: "First answer",
          status: "complete",
          sources: [{ documentId: "doc_1", title: "Refund Policy", chunkId: "chunk_1" }],
          confidence: "medium",
          promptVersion: "live.answer.v1",
          model: "deterministic-live-v1",
        },
      ]),
    ).toEqual([
      {
        id: "sug_1",
        kind: "answer question",
        content: "First answer",
        state: "complete",
        meta: "live.answer.v1 / deterministic-live-v1",
        sources: ["Refund Policy (chunk_1)"],
      },
    ]);
  });
});
