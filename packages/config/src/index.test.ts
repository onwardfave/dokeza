import { describe, expect, it } from "vitest";
import { parseConfig } from "./index.js";

describe("parseConfig", () => {
  it("uses documented initial provider and retention defaults", () => {
    const result = parseConfig({}, "realtime");

    expect(result.ok).toBe(true);
    expect(result.config?.auth).toEqual({
      issuer: "https://auth.local.dokeza.dev",
      audience: "dokeza",
      signingSecret: "dev_only_dokeza_auth_secret_do_not_use",
      apiTokenTtlSeconds: 3600,
      realtimeTokenTtlSeconds: 300,
      developmentAuthEnabled: true,
    });
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
    expect(result.config?.database).toEqual({
      realtimePersistence: "memory",
      poolMax: 10,
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

  it("accepts explicit auth settings without echoing the signing secret", () => {
    const result = parseConfig(
      {
        DOKEZA_AUTH_ISSUER: "https://auth.example.com",
        DOKEZA_AUTH_AUDIENCE: "dokeza-api",
        DOKEZA_AUTH_SIGNING_SECRET: "configured_secret_with_at_least_32_chars",
        DOKEZA_AUTH_API_TOKEN_TTL_SECONDS: "7200",
        DOKEZA_AUTH_REALTIME_TOKEN_TTL_SECONDS: "120",
        DOKEZA_DEV_AUTH_ENABLED: "false",
      },
      "api",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.auth).toEqual({
      issuer: "https://auth.example.com",
      audience: "dokeza-api",
      signingSecret: "configured_secret_with_at_least_32_chars",
      apiTokenTtlSeconds: 7200,
      realtimeTokenTtlSeconds: 120,
      developmentAuthEnabled: false,
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
    expect(missingKey.errors).toContain(
      "DOKEZA_AUTH_SIGNING_SECRET must be at least 32 characters outside local/test.",
    );

    const invalidEndpoint = parseConfig(
      {
        DOKEZA_ENV: "production",
        DOKEZA_AUTH_SIGNING_SECRET: "configured_secret_with_at_least_32_chars",
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
        DOKEZA_AUTH_SIGNING_SECRET: "configured_secret_with_at_least_32_chars",
        DEEPGRAM_API_KEY: "dg_real_secret",
        DEEPGRAM_ENDPOINT: "ws://stt.example.com/v1/listen",
      },
      "realtime",
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("DEEPGRAM_ENDPOINT must use wss in production.");
    expect(result.errors.join(" ")).not.toContain("dg_real_secret");
  });

  it("accepts explicit PostgreSQL realtime persistence settings", () => {
    const result = parseConfig(
      {
        DOKEZA_REALTIME_PERSISTENCE: "postgres",
        DATABASE_URL: "postgres://dokeza:secret@localhost:5432/dokeza",
        DATABASE_POOL_MAX: "5",
      },
      "realtime",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.database).toEqual({
      realtimePersistence: "postgres",
      url: "postgres://dokeza:secret@localhost:5432/dokeza",
      poolMax: 5,
    });
  });

  it("requires sanitized database configuration for PostgreSQL realtime persistence", () => {
    const missingUrl = parseConfig({ DOKEZA_REALTIME_PERSISTENCE: "postgres" }, "realtime");

    expect(missingUrl.ok).toBe(false);
    expect(missingUrl.errors).toContain(
      "DATABASE_URL is required when DOKEZA_REALTIME_PERSISTENCE is postgres.",
    );

    const invalidUrl = parseConfig(
      {
        DOKEZA_REALTIME_PERSISTENCE: "postgres",
        DATABASE_URL: "not-a-secret-url",
        DATABASE_POOL_MAX: "0",
      },
      "realtime",
    );

    expect(invalidUrl.ok).toBe(false);
    expect(invalidUrl.errors.join(" ")).not.toContain("not-a-secret-url");
    expect(invalidUrl.errors).toContain("DATABASE_URL must be a postgres connection URL.");
    expect(invalidUrl.errors).toContain("DATABASE_POOL_MAX must be a positive integer.");
  });

  it("rejects unsafe telemetry configuration without echoing values", () => {
    const result = parseConfig(
      {
        DOKEZA_ENV: "production",
        DOKEZA_AUTH_SIGNING_SECRET: "too_short",
        DOKEZA_DEV_AUTH_ENABLED: "true",
        DOKEZA_TELEMETRY_CONTENT_LOGGING_ALLOWED: "true",
        OTEL_EXPORTER_OTLP_ENDPOINT: "not-a-url",
        OTEL_TRACES_SAMPLER_ARG: "2",
      },
      "api",
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).not.toContain("not-a-url");
    expect(result.errors.join(" ")).not.toContain("too_short");
    expect(result.errors).toContain("DOKEZA_DEV_AUTH_ENABLED can only be true in local or test.");
    expect(result.errors).toContain(
      "DOKEZA_TELEMETRY_CONTENT_LOGGING_ALLOWED cannot be true in production.",
    );
  });

  it("rejects invalid auth TTLs and short secrets without echoing values", () => {
    const result = parseConfig(
      {
        DOKEZA_AUTH_SIGNING_SECRET: "short_secret",
        DOKEZA_AUTH_API_TOKEN_TTL_SECONDS: "0",
        DOKEZA_AUTH_REALTIME_TOKEN_TTL_SECONDS: "not-a-number",
      },
      "api",
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).not.toContain("short_secret");
    expect(result.errors.join(" ")).not.toContain("not-a-number");
    expect(result.errors).toContain(
      "DOKEZA_AUTH_SIGNING_SECRET must be at least 32 characters outside local/test.",
    );
    expect(result.errors).toContain(
      "DOKEZA_AUTH_API_TOKEN_TTL_SECONDS must be a positive integer.",
    );
    expect(result.errors).toContain(
      "DOKEZA_AUTH_REALTIME_TOKEN_TTL_SECONDS must be a positive integer.",
    );
  });
});
