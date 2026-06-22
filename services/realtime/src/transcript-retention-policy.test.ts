import { describe, expect, it } from "vitest";
import {
  evaluateTranscriptTimelinePersistence,
  type TranscriptRetentionMode,
} from "./transcript-retention-policy.js";

describe("evaluateTranscriptTimelinePersistence", () => {
  it.each<TranscriptRetentionMode>(["7_days", "30_days", "1_year", "indefinite"])(
    "allows cloud timeline persistence for %s",
    (retentionMode) => {
      const decision = evaluateTranscriptTimelinePersistence({
        retentionMode,
        timelineRecordKind: "segment",
        workspaceId: "ws_test",
        sessionId: "sess_test",
      });

      expect(decision.action).toBe("persist");
      expect(decision.reason).toBe("cloud_retention_allowed");
      expect(decision.telemetry.fields).toMatchObject({
        workspaceId: "ws_test",
        sessionId: "sess_test",
        retentionMode,
        timelineRecordKind: "segment",
        action: "persist",
      });
    },
  );

  it.each<TranscriptRetentionMode>(["live_only", "local_only"])(
    "skips cloud timeline persistence for %s",
    (retentionMode) => {
      const decision = evaluateTranscriptTimelinePersistence({
        retentionMode,
        timelineRecordKind: "gap",
        workspaceId: "ws_test",
        sessionId: "sess_test",
      });

      expect(decision.action).toBe("skip");
      expect(decision.telemetry.fields).toMatchObject({
        workspaceId: "ws_test",
        sessionId: "sess_test",
        retentionMode,
        timelineRecordKind: "gap",
        action: "skip",
      });
    },
  );

  it("denies cloud timeline persistence for unknown retention modes", () => {
    const decision = evaluateTranscriptTimelinePersistence({
      retentionMode: "future_mode",
      timelineRecordKind: "segment",
      workspaceId: "ws_test",
      sessionId: "sess_test",
    });

    expect(decision.action).toBe("skip");
    expect(decision.reason).toBe("unknown_retention_mode");
  });

  it("does not include sensitive content fields in policy telemetry", () => {
    const decision = evaluateTranscriptTimelinePersistence({
      retentionMode: "live_only",
      timelineRecordKind: "segment",
      workspaceId: "ws_test",
      sessionId: "sess_test",
    });

    expect(Object.keys(decision.telemetry.fields)).not.toEqual(
      expect.arrayContaining(["text", "transcript", "prompt", "document", "suggestion", "audio"]),
    );
  });
});
