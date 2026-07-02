import {
  validateMeetingDeleteResponse,
  validateMeetingDetailResponse,
  validateMeetingExportResponse,
  validateMeetingHistoryResponse,
  type MeetingDeleteResponse,
  type MeetingDetailResponse,
  type MeetingExportResponse,
  type MeetingSummary,
} from "@dokeza/contracts";

export interface MeetingReviewApiFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type MeetingReviewApiFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
  },
) => Promise<MeetingReviewApiFetchResponse>;

export interface MeetingReviewApiRequest {
  apiBaseUrl: string;
  apiToken: string;
  workspaceId: string;
  fetcher?: MeetingReviewApiFetch;
}

export interface MeetingReviewApiMeetingRequest extends MeetingReviewApiRequest {
  meetingId: string;
}

export interface MeetingReviewApiExportRequest extends MeetingReviewApiMeetingRequest {
  format: MeetingExportResponse["format"];
}

function trimBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

function meetingPath(input: MeetingReviewApiMeetingRequest): string {
  const workspaceId = encodeURIComponent(input.workspaceId);
  const meetingId = encodeURIComponent(input.meetingId);
  return `${trimBaseUrl(input.apiBaseUrl)}/v1/workspaces/${workspaceId}/meetings/${meetingId}`;
}

async function fetchJson(
  input: MeetingReviewApiRequest,
  url: string,
  init: { method?: string } = {},
): Promise<unknown> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${input.apiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`meeting_review_api_failed:${response.status}`);
  }

  return response.json();
}

export async function listMeetings(
  input: MeetingReviewApiRequest,
): Promise<MeetingSummary[]> {
  const workspaceId = encodeURIComponent(input.workspaceId);
  const body = await fetchJson(
    input,
    `${trimBaseUrl(input.apiBaseUrl)}/v1/workspaces/${workspaceId}/meetings`,
  );

  if (!validateMeetingHistoryResponse(body)) {
    throw new Error("meeting_review_api_invalid_response");
  }

  return body.meetings;
}

export async function getMeetingDetail(
  input: MeetingReviewApiMeetingRequest,
): Promise<MeetingDetailResponse> {
  const body = await fetchJson(input, meetingPath(input));
  if (!validateMeetingDetailResponse(body)) {
    throw new Error("meeting_review_api_invalid_response");
  }

  return body;
}

export async function exportMeeting(
  input: MeetingReviewApiExportRequest,
): Promise<MeetingExportResponse> {
  const body = await fetchJson(input, `${meetingPath(input)}/export?format=${input.format}`);
  if (!validateMeetingExportResponse(body)) {
    throw new Error("meeting_review_api_invalid_response");
  }

  return body;
}

export async function deleteMeeting(
  input: MeetingReviewApiMeetingRequest,
): Promise<MeetingDeleteResponse> {
  const body = await fetchJson(input, meetingPath(input), { method: "DELETE" });
  if (!validateMeetingDeleteResponse(body)) {
    throw new Error("meeting_review_api_invalid_response");
  }

  return body;
}
