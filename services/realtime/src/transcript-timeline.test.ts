import { describe, expect, it } from "vitest";
import { InMemoryTranscriptTimelineSink } from "./transcript-timeline.js";
import type { SttTranscriptEvent } from "./stt-adapter.js";

function finalEvent(overrides: Partial<SttTranscriptEvent["payload"]> = {}): SttTranscriptEvent {
  return {
    type: "transcript.final",
    payload: {
      segment_id: "seg_1",
      speaker: "user",
      text: "stored transcript text",
      start_ms: 100,
      end_ms: 250,
      confidence: 0.91,
      ...overrides,
    },
  };
}

describe("InMemoryTranscriptTimelineSink", () => {
  it("persists final transcript segments with workspace and session scope", async () => {
    const sink = new InMemoryTranscriptTimelineSink();

    const result = await sink.recordTranscriptEvent({
      workspaceId: "ws_test",
      sessionId: "sess_test",
      event: finalEvent(),
    });

    expect(result.status).toBe("recorded");
    expect(sink.getSnapshot("ws_test", "sess_test").segments).toEqual([
      {
        segmentId: "seg_1",
        workspaceId: "ws_test",
        sessionId: "sess_test",
        speaker: "user",
        text: "stored transcript text",
        startMs: 100,
        endMs: 250,
        confidence: 0.91,
        state: "final",
      },
    ]);
  });

  it("ignores partial transcript events for durable storage", async () => {
    const sink = new InMemoryTranscriptTimelineSink();

    const result = await sink.recordTranscriptEvent({
      workspaceId: "ws_test",
      sessionId: "sess_test",
      event: {
        ...finalEvent(),
        type: "transcript.partial",
      },
    });

    expect(result.status).toBe("ignored");
    expect(sink.getSnapshot("ws_test", "sess_test").segments).toEqual([]);
  });

  it("replaces duplicate final segment writes by segment ID", async () => {
    const sink = new InMemoryTranscriptTimelineSink();

    await sink.recordTranscriptEvent({
      workspaceId: "ws_test",
      sessionId: "sess_test",
      event: finalEvent({ text: "first final", confidence: 0.7 }),
    });
    const result = await sink.recordTranscriptEvent({
      workspaceId: "ws_test",
      sessionId: "sess_test",
      event: finalEvent({ text: "updated final", confidence: 0.9 }),
    });

    expect(result.status).toBe("updated");
    expect(sink.getSnapshot("ws_test", "sess_test").segments).toHaveLength(1);
    expect(sink.getSnapshot("ws_test", "sess_test").segments[0]?.text).toBe("updated final");
  });

  it("rejects workspace and session mismatches for existing segments", async () => {
    const sink = new InMemoryTranscriptTimelineSink();

    await sink.recordTranscriptEvent({
      workspaceId: "ws_test",
      sessionId: "sess_test",
      event: finalEvent(),
    });

    await expect(
      sink.recordTranscriptEvent({
        workspaceId: "ws_other",
        sessionId: "sess_test",
        event: finalEvent(),
      }),
    ).rejects.toThrow("Transcript segment scope mismatch.");
    await expect(
      sink.recordTranscriptEvent({
        workspaceId: "ws_test",
        sessionId: "sess_other",
        event: finalEvent(),
      }),
    ).rejects.toThrow("Transcript segment scope mismatch.");
  });

  it("records audio gaps and returns an ordered context snapshot", async () => {
    const sink = new InMemoryTranscriptTimelineSink();

    await sink.recordTranscriptEvent({
      workspaceId: "ws_test",
      sessionId: "sess_test",
      event: finalEvent({ segment_id: "seg_late", start_ms: 500, end_ms: 600 }),
    });
    await sink.recordGap({
      workspaceId: "ws_test",
      sessionId: "sess_test",
      stream: "microphone",
      startMs: 250,
      endMs: 400,
      droppedChunks: 10,
      reason: "local_buffer_full",
    });
    await sink.recordTranscriptEvent({
      workspaceId: "ws_test",
      sessionId: "sess_test",
      event: finalEvent({ segment_id: "seg_early", start_ms: 0, end_ms: 100 }),
    });

    const snapshot = sink.getSnapshot("ws_test", "sess_test");

    expect(snapshot.segments.map((segment) => segment.segmentId)).toEqual([
      "seg_early",
      "seg_late",
    ]);
    expect(snapshot.gaps).toEqual([
      {
        workspaceId: "ws_test",
        sessionId: "sess_test",
        stream: "microphone",
        startMs: 250,
        endMs: 400,
        droppedChunks: 10,
        reason: "local_buffer_full",
      },
    ]);
  });

  it("emits metadata-only telemetry", async () => {
    const sink = new InMemoryTranscriptTimelineSink();

    const result = await sink.recordTranscriptEvent({
      workspaceId: "ws_test",
      sessionId: "sess_test",
      event: finalEvent(),
    });

    expect(JSON.stringify(result.telemetry)).not.toContain("stored transcript text");
    expect(JSON.stringify(result.telemetry)).not.toContain("text");
  });
});
