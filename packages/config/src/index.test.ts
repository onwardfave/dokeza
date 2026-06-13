import { describe, expect, it } from "vitest";
import { parseConfig } from "./index.js";

describe("parseConfig", () => {
  it("uses documented initial provider and retention defaults", () => {
    const result = parseConfig({}, "realtime");

    expect(result.ok).toBe(true);
    expect(result.config?.telemetry).toEqual({
      enabled: true,
      otlpEndpoint: "http://localhost:4318/",
      tracesSampleRate: 1,
      contentLoggingAllowed: false,
    });
    expect(result.config?.providers).toEqual({
      stt: "deepgram",
      llm: "openai",
      embeddings: "openai",
    });
    expect(result.config?.retentionDefaults).toEqual({
      individual: "7_days",
      team: "30_days",
      enterprise: "30_days",
    });
  });

  it("rejects invalid ports without exposing environment values in errors", () => {
    const result = parseConfig({ PORT: "not-a-port" }, "api");

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).not.toContain("not-a-port");
  });

  it("accepts explicit OTLP telemetry settings", () => {
    const result = parseConfig(
      {
        DOKEZA_TELEMETRY_ENABLED: "false",
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.com:4318",
        OTEL_TRACES_SAMPLER_ARG: "0.25",
      },
      "api",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.telemetry).toEqual({
      enabled: false,
      otlpEndpoint: "https://otel.example.com:4318/",
      tracesSampleRate: 0.25,
      contentLoggingAllowed: false,
    });
  });

  it("rejects unsafe telemetry configuration without echoing values", () => {
    const result = parseConfig(
      {
        DOKEZA_ENV: "production",
        DOKEZA_TELEMETRY_CONTENT_LOGGING_ALLOWED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "not-a-url",
        OTEL_TRACES_SAMPLER_ARG: "2",
      },
      "api",
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).not.toContain("not-a-url");
    expect(result.errors).toContain(
      "DOKEZA_TELEMETRY_CONTENT_LOGGING_ALLOWED cannot be true in production.",
    );
  });
});
