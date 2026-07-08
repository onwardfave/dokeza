import type { MeetingDetailResponse, MeetingSummary } from "@dokeza/contracts";

export type MeetingReviewLoadState = "idle" | "loading" | "ready" | "degraded" | "failed";

export interface MeetingReviewView {
  state: MeetingReviewLoadState;
  emptyText: string;
  detailText: string;
  canRefresh: boolean;
}

export function getMeetingReviewView(input: {
  state: MeetingReviewLoadState;
  meetings: MeetingSummary[];
  detail: MeetingDetailResponse | null;
  hasAuth: boolean;
  message: string;
}): MeetingReviewView {
  if (!input.hasAuth) {
    return {
      state: "idle",
      emptyText: "Sign in to load meeting history",
      detailText: input.message,
      canRefresh: false,
    };
  }

  if (input.state === "loading") {
    return {
      state: "loading",
      emptyText: "Loading meeting history",
      detailText: input.message,
      canRefresh: false,
    };
  }

  if (input.state === "failed") {
    return {
      state: "failed",
      emptyText: "Meeting history unavailable",
      detailText: input.message,
      canRefresh: true,
    };
  }

  if (input.state === "degraded") {
    return {
      state: "degraded",
      emptyText: "Meeting record incomplete",
      detailText: input.message,
      canRefresh: true,
    };
  }

  if (input.meetings.length === 0) {
    return {
      state: "ready",
      emptyText: "No meetings yet",
      detailText: input.message,
      canRefresh: true,
    };
  }

  if (input.detail === null) {
    return {
      state: "ready",
      emptyText: "Select a meeting",
      detailText: input.message,
      canRefresh: true,
    };
  }

  return {
    state: "ready",
    emptyText: input.detail.transcript.segments.length === 0 ? "Transcript empty" : "",
    detailText: input.message,
    canRefresh: true,
  };
}
