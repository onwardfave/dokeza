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
      stt: {
        provider: "deepgram",
        deepgram: {
          endpoint: "wss://api.deepgram.com/v1/listen",
          model: "nova-3",
          language: "en",
          interimResults: true,
          punctuate: true,
          smartFormat: true,
          encoding: "linear16",
          sampleRateHz: 16000,
          channels: 1,
          timeoutMs: 5000,
        },
      },
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

  it("accepts explicit Deepgram STT settings", () => {
    const result = parseConfig(
      {
        DEEPGRAM_API_KEY: "dg_test_secret",
        DEEPGRAM_ENDPOINT: "wss://stt.example.com/v1/listen",
        DEEPGRAM_MODEL: "nova-2-meeting",
        DEEPGRAM_LANGUAGE: "en-US",
        DEEPGRAM_INTERIM_RESULTS: "false",
        DEEPGRAM_PUNCTUATE: "false",
        DEEPGRAM_SMART_FORMAT: "false",
        DEEPGRAM_ENCODING: "linear16",
        DEEPGRAM_SAMPLE_RATE_HZ: "48000",
        DEEPGRAM_CHANNELS: "2",
        DEEPGRAM_TIMEOUT_MS: "10000",
      },
      "realtime",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.providers.stt.deepgram).toEqual({
      apiKey: "dg_test_secret",
      endpoint: "wss://stt.example.com/v1/listen",
      model: "nova-2-meeting",
      language: "en-US",
      interimResults: false,
      punctuate: false,
      smartFormat: false,
      encoding: "linear16",
      sampleRateHz: 48000,
      channels: 2,
      timeoutMs: 10000,
    });
  });

  it("requires a Deepgram API key in production without echoing the key", () => {
    const missingKey = parseConfig({ DOKEZA_ENV: "production" }, "realtime");

    expect(missingKey.ok).toBe(false);
    expect(missingKey.errors).toContain("DEEPGRAM_API_KEY is required in production.");

    const invalidEndpoint = parseConfig(
      {
        DOKEZA_ENV: "production",
        DEEPGRAM_API_KEY: "dg_real_secret",
        DEEPGRAM_ENDPOINT: "not-a-url",
      },
      "realtime",
    );

    expect(invalidEndpoint.ok).toBe(false);
    expect(invalidEndpoint.errors.join(" ")).not.toContain("dg_real_secret");
    expect(invalidEndpoint.errors.join(" ")).not.toContain("not-a-url");
  });

  it("requires Deepgram WebSocket TLS in production", () => {
    const result = parseConfig(
      {
        DOKEZA_ENV: "production",
        DEEPGRAM_API_KEY: "dg_real_secret",
        DEEPGRAM_ENDPOINT: "ws://stt.example.com/v1/listen",
      },
      "realtime",
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("DEEPGRAM_ENDPOINT must use wss in production.");
    expect(result.errors.join(" ")).not.toContain("dg_real_secret");
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
