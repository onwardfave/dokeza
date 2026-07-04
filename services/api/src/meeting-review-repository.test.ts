import { describe, expect, it } from "vitest";
import { InMemoryMeetingReviewRepository } from "./meeting-review-repository.js";

describe("MeetingReviewRepository", () => {
  it("filters meeting history by transcript search without returning transcript content", async () => {
    const repository = new InMemoryMeetingReviewRepository([
      {
        meeting: {
          meeting_id: "sess_pricing",
          workspace_id: "ws_1",
          created_by: "user_1",
          meeting_source: "manual",
          status: "ended",
          started_at: "2026-07-02T00:00:00.000Z",
          segment_count: 0,
          gap_count: 0,
        },
        segments: [
          {
            segment_id: "seg_pricing",
            speaker: "remote",
            text: "Can you send the pricing recap?",
            start_ms: 0,
            end_ms: 1200,
            confidence: 0.94,
          },
        ],
        suggestions: [
          {
            suggestion_id: "sug_pricing",
            request_id: "sreq_pricing",
            kind: "answer_question",
            content: "Send the pricing recap.",
            sources: [
              {
                document_id: "doc_pricing",
                title: "Pricing Guide",
                chunk_id: "chunk_pricing",
              },
            ],
            confidence: "medium",
            prompt_version: "live.answer.v1",
            model: "deterministic-live-v1",
            server_seq: 8,
            created_at: "2026-07-02T00:03:00.000Z",
          },
        ],
      },
      {
        meeting: {
          meeting_id: "sess_support",
          workspace_id: "ws_1",
          created_by: "user_1",
          meeting_source: "manual",
          status: "ended",
          started_at: "2026-07-02T01:00:00.000Z",
          segment_count: 0,
          gap_count: 0,
        },
        segments: [
          {
            segment_id: "seg_support",
            speaker: "remote",
            text: "The deployment is blocked by permissions.",
            start_ms: 0,
            end_ms: 1500,
            confidence: 0.9,
          },
        ],
      },
    ]);

    const body = await repository.listMeetings("ws_1", { transcriptQuery: "pricing" });

    expect(body.meetings.map((meeting) => meeting.meeting_id)).toEqual(["sess_pricing"]);
    expect(JSON.stringify(body)).not.toContain("pricing recap");
    expect(JSON.stringify(body)).not.toContain("Send the pricing recap");

    const detail = await repository.getMeetingDetail("ws_1", "sess_pricing");
    expect(detail?.suggestions).toEqual([
      {
        suggestion_id: "sug_pricing",
        request_id: "sreq_pricing",
        kind: "answer_question",
        content: "Send the pricing recap.",
        sources: [
          {
            document_id: "doc_pricing",
            title: "Pricing Guide",
            chunk_id: "chunk_pricing",
          },
        ],
        confidence: "medium",
        prompt_version: "live.answer.v1",
        model: "deterministic-live-v1",
        server_seq: 8,
        created_at: "2026-07-02T00:03:00.000Z",
      },
    ]);

    const exported = await repository.exportMeeting("ws_1", "sess_pricing", "markdown");
    expect(exported?.content).toContain("## Suggestions");
    expect(exported?.content).toContain("Send the pricing recap.");
    expect(exported?.content).toContain("Pricing Guide (doc_pricing/chunk_pricing)");
  });

  it("cleans up expired meetings according to retention mode and workspace scope", async () => {
    const repository = new InMemoryMeetingReviewRepository({
      retentionMode: "7_days",
      seeds: [
        {
          meeting: {
            meeting_id: "sess_old",
            workspace_id: "ws_1",
            created_by: "user_1",
            meeting_source: "manual",
            status: "ended",
            ended_at: "2026-06-20T00:00:00.000Z",
            segment_count: 1,
            gap_count: 0,
          },
          segments: [
            {
              segment_id: "seg_old",
              speaker: "user",
              text: "old retained transcript",
              start_ms: 0,
              end_ms: 100,
              confidence: 0.8,
            },
          ],
        },
        {
          meeting: {
            meeting_id: "sess_recent",
            workspace_id: "ws_1",
            created_by: "user_1",
            meeting_source: "manual",
            status: "ended",
            ended_at: "2026-07-01T00:00:00.000Z",
            segment_count: 0,
            gap_count: 0,
          },
        },
        {
          meeting: {
            meeting_id: "sess_other_workspace",
            workspace_id: "ws_2",
            created_by: "user_2",
            meeting_source: "manual",
            status: "ended",
            ended_at: "2026-06-20T00:00:00.000Z",
            segment_count: 0,
            gap_count: 0,
          },
        },
      ],
    });

    await expect(
      repository.cleanupExpiredMeetings({
        workspaceId: "ws_1",
        now: new Date("2026-07-03T00:00:00.000Z"),
      }),
    ).resolves.toEqual({
      workspace_id: "ws_1",
      retention_mode: "7_days",
      deleted_count: 1,
    });

    await expect(repository.getMeetingDetail("ws_1", "sess_old")).resolves.toBeUndefined();
    await expect(repository.getMeetingDetail("ws_1", "sess_recent")).resolves.toBeDefined();
    await expect(
      repository.getMeetingDetail("ws_2", "sess_other_workspace"),
    ).resolves.toBeDefined();
  });
});
