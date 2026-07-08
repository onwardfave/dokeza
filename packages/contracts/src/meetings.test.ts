import { describe, expect, it } from "vitest";
import {
  validateMeetingDeleteResponse,
  validateMeetingDetailResponse,
  validateMeetingExportResponse,
  validateMeetingHistoryResponse,
} from "./meetings.js";

describe("meeting review contracts", () => {
  it("accepts meeting history summaries without transcript content", () => {
    expect(
      validateMeetingHistoryResponse({
        workspace_id: "ws_1",
        meetings: [
          {
            meeting_id: "sess_1",
            workspace_id: "ws_1",
            created_by: "user_1",
            meeting_source: "manual",
            status: "ended",
            started_at: "2026-07-02T00:00:00.000Z",
            ended_at: "2026-07-02T00:30:00.000Z",
            segment_count: 3,
            gap_count: 1,
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts meeting detail with transcript segments, audio gaps, and suggestions", () => {
    expect(
      validateMeetingDetailResponse({
        meeting: {
          meeting_id: "sess_1",
          workspace_id: "ws_1",
          created_by: "user_1",
          meeting_source: "manual",
          status: "ended",
          started_at: "2026-07-02T00:00:00.000Z",
          ended_at: "2026-07-02T00:30:00.000Z",
          segment_count: 1,
          gap_count: 1,
        },
        transcript: {
          segments: [
            {
              segment_id: "seg_1",
              speaker: "user",
              text: "confirmed next steps",
              start_ms: 0,
              end_ms: 1200,
              confidence: 0.91,
            },
          ],
          gaps: [
            {
              stream: "microphone",
              start_ms: 1200,
              end_ms: 1800,
              dropped_chunks: 6,
              reason: "user_paused_capture",
            },
          ],
        },
        suggestions: [
          {
            suggestion_id: "sug_1",
            request_id: "sreq_1",
            kind: "answer_question",
            content: "Offer a two-week onboarding plan.",
            sources: [
              {
                document_id: "doc_1",
                title: "Onboarding Guide",
                chunk_id: "chunk_1",
              },
            ],
            confidence: "medium",
            prompt_version: "sales.answer.v1",
            model: "deterministic-live-v1",
            server_seq: 42,
            created_at: "2026-07-02T00:15:00.000Z",
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts markdown and json export responses", () => {
    expect(
      validateMeetingExportResponse({
        meeting_id: "sess_1",
        workspace_id: "ws_1",
        format: "markdown",
        content_type: "text/markdown",
        content: "# Meeting sess_1\n",
      }),
    ).toBe(true);

    expect(
      validateMeetingExportResponse({
        meeting_id: "sess_1",
        workspace_id: "ws_1",
        format: "json",
        content_type: "application/json",
        content: '{"meeting_id":"sess_1"}',
      }),
    ).toBe(true);
  });

  it("rejects invalid delete responses", () => {
    expect(
      validateMeetingDeleteResponse({
        meeting_id: "sess_1",
        workspace_id: "ws_1",
        deleted: true,
      }),
    ).toBe(true);
    expect(validateMeetingDeleteResponse({ meeting_id: "sess_1", deleted: true })).toBe(false);
  });
});
