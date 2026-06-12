import { describe, expect, it } from "vitest";
import { createTelemetryEvent, redactTelemetryFields } from "./index.js";

describe("telemetry redaction", () => {
  it("redacts restricted content by default", () => {
    expect(redactTelemetryFields({
      workspaceId: "ws_a",
      transcriptText: "customer secret",
      prompt: "answer from this document",
      nested: {
        suggestionContent: "say this"
      }
    })).toEqual({
      workspaceId: "ws_a",
      transcriptText: "[REDACTED]",
      prompt: "[REDACTED]",
      nested: {
        suggestionContent: "[REDACTED]"
      }
    });
  });

  it("keeps production verification metrics", () => {
    expect(createTelemetryEvent("realtime.latency", {
      workspaceId: "ws_a",
      stage: "stt",
      latencyMs: 420,
      errorCode: "none"
    })).toEqual({
      name: "realtime.latency",
      fields: {
        workspaceId: "ws_a",
        stage: "stt",
        latencyMs: 420,
        errorCode: "none"
      }
    });
  });
});
