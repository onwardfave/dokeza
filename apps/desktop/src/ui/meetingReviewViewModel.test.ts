import { describe, expect, it } from "vitest";
import { getMeetingReviewView } from "./meetingReviewViewModel.js";

describe("meetingReviewViewModel", () => {
  it("shows unauthenticated and loading states", () => {
    expect(
      getMeetingReviewView({
        state: "idle",
        meetings: [],
        detail: null,
        hasAuth: false,
        message: "No meeting history loaded",
      }),
    ).toMatchObject({
      emptyText: "Sign in to load meeting history",
      canRefresh: false,
    });

    expect(
      getMeetingReviewView({
        state: "loading",
        meetings: [],
        detail: null,
        hasAuth: true,
        message: "Loading",
      }),
    ).toMatchObject({
      emptyText: "Loading meeting history",
      canRefresh: false,
    });
  });

  it("shows failed and degraded states without transcript content", () => {
    expect(
      getMeetingReviewView({
        state: "failed",
        meetings: [],
        detail: null,
        hasAuth: true,
        message: "Meeting history unavailable",
      }),
    ).toMatchObject({
      emptyText: "Meeting history unavailable",
      canRefresh: true,
    });

    expect(
      getMeetingReviewView({
        state: "degraded",
        meetings: [],
        detail: null,
        hasAuth: true,
        message: "Meeting record incomplete",
      }),
    ).toMatchObject({
      emptyText: "Meeting record incomplete",
      canRefresh: true,
    });
  });
});
