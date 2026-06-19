import { describe, expect, it } from "vitest";
import { TranscriptProcessor, type TranscriptProcessorResult } from "./transcript-processor.js";
import type { SttTranscriptEvent } from "./stt-adapter.js";

function partial(segmentId: string, text = "partial text", startMs = 0): SttTranscriptEvent {
  return {
    type: "transcript.partial",
    payload: {
      segment_id: segmentId,
      speaker: "user",
      text,
      start_ms: startMs,
      end_ms: startMs + 100,
      confidence: 0.7,
    },
  };
}

function final(segmentId: string, text = "final text", startMs = 0): SttTranscriptEvent {
  return {
    type: "transcript.final",
    payload: {
      segment_id: segmentId,
      speaker: "user",
      text,
      start_ms: startMs,
      end_ms: startMs + 100,
      confidence: 0.92,
    },
  };
}

function expectEmitted(result: TranscriptProcessorResult): SttTranscriptEvent {
  expect(result.action).toBe("emit");
  if (result.action !== "emit") throw new Error("Expected emitted transcript event");
  return result.event;
}

describe("TranscriptProcessor", () => {
  it("accepts partial revisions and finalizes the same segment", () => {
    const processor = new TranscriptProcessor({ sessionId: "sess_1", workspaceId: "ws_1" });

    expectEmitted(processor.process(partial("seg_1", "first partial")));
    const revised = expectEmitted(processor.process(partial("seg_1", "revised partial")));
    const finalized = expectEmitted(processor.process(final("seg_1", "final answer")));

    expect(revised.payload.text).toBe("revised partial");
    expect(finalized.type).toBe("transcript.final");
    expect(finalized.payload.text).toBe("final answer");
    expect(processor.getSegment("seg_1")?.state).toBe("final");
  });

  it("suppresses duplicate final segments", () => {
    const processor = new TranscriptProcessor({ sessionId: "sess_1", workspaceId: "ws_1" });

    expectEmitted(processor.process(final("seg_1", "final answer")));
    const duplicate = processor.process(final("seg_1", "final answer"));

    expect(duplicate).toMatchObject({
      action: "suppress",
      reason: "duplicate_final",
    });
  });

  it("suppresses stale partial updates after finalization", () => {
    const processor = new TranscriptProcessor({ sessionId: "sess_1", workspaceId: "ws_1" });

    expectEmitted(processor.process(final("seg_1", "final answer")));
    const stale = processor.process(partial("seg_1", "late partial"));

    expect(stale).toMatchObject({
      action: "suppress",
      reason: "partial_after_final",
    });
  });

  it("suppresses segments that move the transcript timeline backwards", () => {
    const processor = new TranscriptProcessor({ sessionId: "sess_1", workspaceId: "ws_1" });

    expectEmitted(processor.process(final("seg_2", "later", 500)));
    const backwards = processor.process(partial("seg_1", "earlier", 100));

    expect(backwards).toMatchObject({
      action: "suppress",
      reason: "timestamp_out_of_order",
    });
  });

  it("drops transcript events after the session closes", () => {
    const processor = new TranscriptProcessor({ sessionId: "sess_1", workspaceId: "ws_1" });

    processor.close();
    const result = processor.process(partial("seg_1"));

    expect(result).toMatchObject({
      action: "suppress",
      reason: "session_closed",
    });
  });

  it("emits metadata-only telemetry without transcript text", () => {
    const processor = new TranscriptProcessor({ sessionId: "sess_1", workspaceId: "ws_1" });

    const result = processor.process(partial("seg_1", "sensitive transcript text"));
    const serialized = JSON.stringify(result.telemetry);

    expect(serialized).not.toContain("sensitive transcript text");
    expect(serialized).not.toContain("text");
    expect(serialized).toContain("seg_1");
    expect(serialized).toContain("sess_1");
  });
});
