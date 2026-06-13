import { describe, expect, it } from "vitest";
import {
  createOtelResourceAttributes,
  createTelemetryEvent,
  redactTelemetryFields,
} from "./index.js";

describe("telemetry redaction", () => {
  it("redacts restricted content by default", () => {
    expect(
      redactTelemetryFields({
        workspaceId: "ws_a",
        transcriptText: "customer secret",
        prompt: "answer from this document",
        nested: {
          suggestionContent: "say this",
        },
      }),
    ).toEqual({
      workspaceId: "ws_a",
      transcriptText: "[REDACTED]",
      prompt: "[REDACTED]",
      nested: {
        suggestionContent: "[REDACTED]",
      },
    });
  });

  it("keeps production verification metrics", () => {
    expect(
      createTelemetryEvent("realtime.latency", {
        workspaceId: "ws_a",
        stage: "stt",
        latencyMs: 420,
        errorCode: "none",
      }),
    ).toEqual({
      name: "realtime.latency",
      fields: {
        workspaceId: "ws_a",
        stage: "stt",
        latencyMs: 420,
        errorCode: "none",
      },
    });
  });

  it("creates OpenTelemetry resource attributes without content fields", () => {
    expect(
      createOtelResourceAttributes({
        environment: "staging",
        serviceName: "realtime",
        serviceVersion: "0.0.0-test",
      }),
    ).toEqual({
      "deployment.environment.name": "staging",
      "service.name": "realtime",
      "service.version": "0.0.0-test",
    });
  });
});
