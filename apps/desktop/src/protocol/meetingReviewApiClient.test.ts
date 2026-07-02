import { describe, expect, it } from "vitest";
import {
  deleteMeeting,
  exportMeeting,
  getMeetingDetail,
  listMeetings,
  type MeetingReviewApiFetch,
} from "./meetingReviewApiClient.js";

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  };
}

describe("meetingReviewApiClient", () => {
  it("lists meetings with workspace and bearer auth", async () => {
    const calls: Array<{ input: string; auth?: string }> = [];
    const fetcher: MeetingReviewApiFetch = async (input, init) => {
      calls.push({
        input,
        ...(init?.headers?.Authorization === undefined ? {} : { auth: init.headers.Authorization }),
      });
      return okJson({
        workspace_id: "ws_1",
        meetings: [
          {
            meeting_id: "sess_1",
            workspace_id: "ws_1",
            created_by: "user_1",
            meeting_source: "manual",
            status: "ended",
            segment_count: 1,
            gap_count: 0,
          },
        ],
      });
    };

    await expect(
      listMeetings({
        apiBaseUrl: "http://127.0.0.1:3000/",
        apiToken: "api_token",
        workspaceId: "ws_1",
        fetcher,
      }),
    ).resolves.toHaveLength(1);
    expect(calls).toEqual([
      {
        input: "http://127.0.0.1:3000/v1/workspaces/ws_1/meetings",
        auth: "Bearer api_token",
      },
    ]);
  });

  it("loads detail, export, and delete routes", async () => {
    const calls: Array<{ input: string; method?: string }> = [];
    const fetcher: MeetingReviewApiFetch = async (input, init) => {
      calls.push({
        input,
        ...(init?.method === undefined ? {} : { method: init.method }),
      });
      if (input.endsWith("/export?format=json")) {
        return okJson({
          meeting_id: "sess_1",
          workspace_id: "ws_1",
          format: "json",
          content_type: "application/json",
          content: "{\"meeting_id\":\"sess_1\"}",
        });
      }
      if (init?.method === "DELETE") {
        return okJson({
          meeting_id: "sess_1",
          workspace_id: "ws_1",
          deleted: true,
        });
      }
      return okJson({
        meeting: {
          meeting_id: "sess_1",
          workspace_id: "ws_1",
          created_by: "user_1",
          meeting_source: "manual",
          status: "ended",
          segment_count: 1,
          gap_count: 0,
        },
        transcript: {
          segments: [
            {
              segment_id: "seg_1",
              speaker: "user",
              text: "hello",
              start_ms: 0,
              end_ms: 100,
              confidence: 0.9,
            },
          ],
          gaps: [],
        },
      });
    };

    await expect(
      getMeetingDetail({
        apiBaseUrl: "http://127.0.0.1:3000",
        apiToken: "api_token",
        workspaceId: "ws_1",
        meetingId: "sess_1",
        fetcher,
      }),
    ).resolves.toMatchObject({ meeting: { meeting_id: "sess_1" } });
    await expect(
      exportMeeting({
        apiBaseUrl: "http://127.0.0.1:3000",
        apiToken: "api_token",
        workspaceId: "ws_1",
        meetingId: "sess_1",
        format: "json",
        fetcher,
      }),
    ).resolves.toMatchObject({ format: "json" });
    await expect(
      deleteMeeting({
        apiBaseUrl: "http://127.0.0.1:3000",
        apiToken: "api_token",
        workspaceId: "ws_1",
        meetingId: "sess_1",
        fetcher,
      }),
    ).resolves.toEqual({
      meeting_id: "sess_1",
      workspace_id: "ws_1",
      deleted: true,
    });

    expect(calls).toEqual([
      {
        input: "http://127.0.0.1:3000/v1/workspaces/ws_1/meetings/sess_1",
      },
      {
        input: "http://127.0.0.1:3000/v1/workspaces/ws_1/meetings/sess_1/export?format=json",
      },
      {
        input: "http://127.0.0.1:3000/v1/workspaces/ws_1/meetings/sess_1",
        method: "DELETE",
      },
    ]);
  });

  it("throws sanitized failures for non-OK and invalid responses", async () => {
    const failingFetcher: MeetingReviewApiFetch = async () => ({
      ok: false,
      status: 403,
      async json() {
        return { error: "workspace_access_denied", transcript: "do not leak" };
      },
    });

    await expect(
      listMeetings({
        apiBaseUrl: "http://127.0.0.1:3000",
        apiToken: "api_token",
        workspaceId: "ws_other",
        fetcher: failingFetcher,
      }),
    ).rejects.toThrow("meeting_review_api_failed:403");

    const invalidFetcher: MeetingReviewApiFetch = async () => okJson({ meetings: [] });
    await expect(
      listMeetings({
        apiBaseUrl: "http://127.0.0.1:3000",
        apiToken: "api_token",
        workspaceId: "ws_1",
        fetcher: invalidFetcher,
      }),
    ).rejects.toThrow("meeting_review_api_invalid_response");
  });
});
