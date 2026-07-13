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
      hostedProvider: {
        enabled: false,
        jwksCacheTtlSeconds: 300,
      },
    });
    expect(result.config?.telemetry).toEqual({
      enabled: true,
      otlpEndpoint: "http://localhost:4318/",
      tracesSampleRate: 1,
      contentLoggingAllowed: false,
    });
    expect(result.config?.api).toEqual({
      allowedOrigins: [
        "http://127.0.0.1:1420",
        "http://localhost:1420",
        "http://tauri.localhost",
        "tauri://localhost",
      ],
      maxJsonBodyBytes: 1_048_576,
      rateLimitWindowMs: 60_000,
      rateLimitMaxRequests: 120,
    });
    expect(result.config?.usage).toEqual({
      liveSuggestion: {
        maxInputTokens: 8192,
        maxTranscriptTokens: 3000,
        maxSourceTokens: 3000,
        maxUserPromptTokens: 512,
        maxOutputTokens: 256,
        sessionCostLimitMicrousd: 150_000,
      },
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
      llm: {
        provider: "deterministic",
        openai: {
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4.1-mini",
          timeoutMs: 10000,
        },
      },
      embeddings: {
        provider: "deterministic",
        openai: {
          baseUrl: "https://api.openai.com/v1",
          model: "text-embedding-3-small",
          timeoutMs: 10000,
          dimensions: 1536,
          sendDimensions: true,
          sendInputType: false,
        },
      },
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

  it("parses live-suggestion budgets and optional metadata-only pricing", () => {
    const result = parseConfig(
      {
        DOKEZA_LIVE_SUGGESTION_MAX_INPUT_TOKENS: "4096",
        DOKEZA_LIVE_SUGGESTION_MAX_TRANSCRIPT_TOKENS: "1400",
        DOKEZA_LIVE_SUGGESTION_MAX_SOURCE_TOKENS: "1200",
        DOKEZA_LIVE_SUGGESTION_MAX_USER_PROMPT_TOKENS: "300",
        DOKEZA_LIVE_SUGGESTION_MAX_OUTPUT_TOKENS: "180",
        DOKEZA_LIVE_SUGGESTION_SESSION_COST_LIMIT_MICROUSD: "120000",
        DOKEZA_LIVE_SUGGESTION_INPUT_MICROUSD_PER_MILLION_TOKENS: "400000",
        DOKEZA_LIVE_SUGGESTION_OUTPUT_MICROUSD_PER_MILLION_TOKENS: "1600000",
      },
      "realtime",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.usage.liveSuggestion).toEqual({
      maxInputTokens: 4096,
      maxTranscriptTokens: 1400,
      maxSourceTokens: 1200,
      maxUserPromptTokens: 300,
      maxOutputTokens: 180,
      sessionCostLimitMicrousd: 120000,
      inputMicrousdPerMillionTokens: 400000,
      outputMicrousdPerMillionTokens: 1600000,
    });
  });

  it("rejects invalid live-suggestion budgets without echoing values", () => {
    const result = parseConfig(
      {
        DOKEZA_LIVE_SUGGESTION_MAX_INPUT_TOKENS: "not-a-budget",
        DOKEZA_LIVE_SUGGESTION_INPUT_MICROUSD_PER_MILLION_TOKENS: "-3",
      },
      "realtime",
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).not.toContain("not-a-budget");
    expect(result.errors.join(" ")).not.toContain("-3");
  });

  it("rejects a partial live-suggestion pricing pair", () => {
    const result = parseConfig(
      {
        DOKEZA_LIVE_SUGGESTION_INPUT_MICROUSD_PER_MILLION_TOKENS: "400000",
      },
      "realtime",
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Live suggestion input and output token prices must be configured together.",
    );
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
      hostedProvider: {
        enabled: false,
        jwksCacheTtlSeconds: 300,
      },
    });
  });

  it("accepts hosted auth provider settings", () => {
    const result = parseConfig(
      {
        DOKEZA_HOSTED_AUTH_ENABLED: "true",
        DOKEZA_HOSTED_AUTH_ISSUER: "https://idp.example.com/",
        DOKEZA_HOSTED_AUTH_AUDIENCE: "dokeza-api",
        DOKEZA_HOSTED_AUTH_JWKS_URL: "https://idp.example.com/.well-known/jwks.json",
        DOKEZA_HOSTED_AUTH_JWKS_CACHE_TTL_SECONDS: "600",
      },
      "api",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.auth.hostedProvider).toEqual({
      enabled: true,
      issuer: "https://idp.example.com/",
      audience: "dokeza-api",
      jwksUrl: "https://idp.example.com/.well-known/jwks.json",
      jwksCacheTtlSeconds: 600,
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

  it("accepts explicit OpenAI LLM settings without echoing credentials", () => {
    const result = parseConfig(
      {
        DOKEZA_LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-secret",
        OPENAI_BASE_URL: "https://llm.example.com/v1",
        OPENAI_MODEL: "gpt-live-test",
        OPENAI_TIMEOUT_MS: "12000",
      },
      "realtime",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.providers.llm).toEqual({
      provider: "openai",
      openai: {
        apiKey: "sk-test-secret",
        baseUrl: "https://llm.example.com/v1",
        model: "gpt-live-test",
        timeoutMs: 12000,
      },
    });
  });

  it("accepts an OpenAI-compatible chat provider (e.g. NVIDIA) with a custom endpoint and model", () => {
    const result = parseConfig(
      {
        DOKEZA_LLM_PROVIDER: "openai_chat",
        OPENAI_API_KEY: "nvapi-test-secret",
        OPENAI_BASE_URL: "https://integrate.api.nvidia.com/v1",
        OPENAI_MODEL: "meta/llama-3.1-8b-instruct",
        OPENAI_TIMEOUT_MS: "12000",
      },
      "realtime",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.providers.llm).toEqual({
      provider: "openai_chat",
      openai: {
        apiKey: "nvapi-test-secret",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        model: "meta/llama-3.1-8b-instruct",
        timeoutMs: 12000,
      },
    });
  });

  it("requires an API key when the chat provider is selected", () => {
    const result = parseConfig({ DOKEZA_LLM_PROVIDER: "openai_chat" }, "realtime");

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "OPENAI_API_KEY is required when DOKEZA_LLM_PROVIDER is openai or openai_chat.",
    );
  });

  it("accepts explicit OpenAI embedding settings without echoing credentials", () => {
    const result = parseConfig(
      {
        DOKEZA_EMBEDDING_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-secret",
        OPENAI_BASE_URL: "https://llm.example.com/v1",
        OPENAI_EMBEDDING_MODEL: "embedding-test",
        OPENAI_EMBEDDING_TIMEOUT_MS: "15000",
        OPENAI_EMBEDDING_DIMENSIONS: "1536",
      },
      "knowledge",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.providers.embeddings).toEqual({
      provider: "openai",
      openai: {
        apiKey: "sk-test-secret",
        baseUrl: "https://llm.example.com/v1",
        model: "embedding-test",
        timeoutMs: 15000,
        dimensions: 1536,
        sendDimensions: true,
        sendInputType: false,
      },
    });
  });

  it("accepts an OpenAI-compatible embedding model with input_type and no dimensions", () => {
    const result = parseConfig(
      {
        DOKEZA_EMBEDDING_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-secret",
        OPENAI_BASE_URL: "https://integrate.api.nvidia.com/v1",
        OPENAI_EMBEDDING_MODEL: "nvidia/nv-embedqa-e5-v5",
        OPENAI_EMBEDDING_DIMENSIONS: "1024",
        OPENAI_EMBEDDING_SEND_DIMENSIONS: "false",
        OPENAI_EMBEDDING_SEND_INPUT_TYPE: "true",
        DOKEZA_REALTIME_PERSISTENCE: "memory",
      },
      "knowledge",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.providers.embeddings.openai).toMatchObject({
      model: "nvidia/nv-embedqa-e5-v5",
      dimensions: 1024,
      sendDimensions: false,
      sendInputType: true,
    });
  });

  it("defaults production AI routing to OpenAI and fails closed without credentials", () => {
    const result = parseConfig(
      {
        DOKEZA_ENV: "production",
        DOKEZA_AUTH_SIGNING_SECRET: "configured_secret_with_at_least_32_chars",
        DOKEZA_HOSTED_AUTH_ISSUER: "https://idp.example.com/",
        DOKEZA_HOSTED_AUTH_AUDIENCE: "dokeza-api",
        DOKEZA_HOSTED_AUTH_JWKS_URL: "https://idp.example.com/.well-known/jwks.json",
        DEEPGRAM_API_KEY: "dg_real_secret",
        DATABASE_URL: "postgres://dokeza:secret@db.example.com:5432/dokeza",
      },
      "realtime",
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "OPENAI_API_KEY is required when DOKEZA_LLM_PROVIDER is openai or openai_chat.",
    );
    expect(result.errors).toContain(
      "OPENAI_API_KEY is required when DOKEZA_EMBEDDING_PROVIDER is openai.",
    );
    expect(result.errors.join(" ")).not.toContain("dg_real_secret");
  });

  it("rejects unsafe OpenAI LLM configuration without echoing values", () => {
    const result = parseConfig(
      {
        DOKEZA_ENV: "production",
        DOKEZA_AUTH_SIGNING_SECRET: "configured_secret_with_at_least_32_chars",
        DOKEZA_HOSTED_AUTH_ISSUER: "https://idp.example.com/",
        DOKEZA_HOSTED_AUTH_AUDIENCE: "dokeza-api",
        DOKEZA_HOSTED_AUTH_JWKS_URL: "https://idp.example.com/.well-known/jwks.json",
        DEEPGRAM_API_KEY: "dg_real_secret",
        DOKEZA_LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-real-secret",
        OPENAI_BASE_URL: "http://llm.example.com/v1",
        OPENAI_TIMEOUT_MS: "0",
        DOKEZA_EMBEDDING_PROVIDER: "deterministic",
        DATABASE_URL: "postgres://dokeza:secret@db.example.com:5432/dokeza",
      },
      "realtime",
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("OPENAI_BASE_URL must use https in production.");
    expect(result.errors).toContain("OPENAI_TIMEOUT_MS must be a positive integer.");
    expect(result.errors.join(" ")).not.toContain("sk-real-secret");
    expect(result.errors.join(" ")).not.toContain("dg_real_secret");
  });

  it("rejects unsafe OpenAI embedding configuration without echoing values", () => {
    const result = parseConfig(
      {
        DOKEZA_EMBEDDING_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-real-secret",
        OPENAI_EMBEDDING_TIMEOUT_MS: "0",
        OPENAI_EMBEDDING_DIMENSIONS: "1024",
        DOKEZA_REALTIME_PERSISTENCE: "postgres",
        DATABASE_URL: "postgres://dokeza:secret@db.example.com:5432/dokeza",
      },
      "knowledge",
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("OPENAI_EMBEDDING_TIMEOUT_MS must be a positive integer.");
    expect(result.errors).toContain(
      "OPENAI_EMBEDDING_DIMENSIONS must be 1536 for the PostgreSQL pgvector schema.",
    );
    expect(result.errors.join(" ")).not.toContain("sk-real-secret");
  });

  it("requires a Deepgram API key in production without echoing the key", () => {
    const missingKey = parseConfig({ DOKEZA_ENV: "production" }, "realtime");

    expect(missingKey.ok).toBe(false);
    expect(missingKey.errors).toContain("DEEPGRAM_API_KEY is required in production.");
    expect(missingKey.errors).toContain(
      "OPENAI_API_KEY is required when DOKEZA_LLM_PROVIDER is openai or openai_chat.",
    );
    expect(missingKey.errors).toContain(
      "DOKEZA_AUTH_SIGNING_SECRET must be at least 32 characters outside local/test.",
    );

    const invalidEndpoint = parseConfig(
      {
        DOKEZA_ENV: "production",
        DOKEZA_AUTH_SIGNING_SECRET: "configured_secret_with_at_least_32_chars",
        DEEPGRAM_API_KEY: "dg_real_secret",
        DEEPGRAM_ENDPOINT: "not-a-url",
        DOKEZA_LLM_PROVIDER: "deterministic",
        DOKEZA_EMBEDDING_PROVIDER: "deterministic",
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
        DOKEZA_HOSTED_AUTH_ISSUER: "https://idp.example.com/",
        DOKEZA_HOSTED_AUTH_AUDIENCE: "dokeza-api",
        DOKEZA_HOSTED_AUTH_JWKS_URL: "https://idp.example.com/.well-known/jwks.json",
        DEEPGRAM_API_KEY: "dg_real_secret",
        DEEPGRAM_ENDPOINT: "ws://stt.example.com/v1/listen",
        DOKEZA_LLM_PROVIDER: "deterministic",
        DOKEZA_EMBEDDING_PROVIDER: "deterministic",
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
        DOKEZA_DATABASE_ROLE: "dokeza_app",
      },
      "realtime",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.database).toEqual({
      realtimePersistence: "postgres",
      url: "postgres://dokeza:secret@localhost:5432/dokeza",
      poolMax: 5,
      role: "dokeza_app",
    });
  });

  it("rejects unsafe PostgreSQL role names without echoing their values", () => {
    const result = parseConfig({ DOKEZA_DATABASE_ROLE: 'admin"; select secret' }, "api");

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "DOKEZA_DATABASE_ROLE must be a valid unquoted PostgreSQL role name.",
    );
    expect(result.errors.join(" ")).not.toContain("select secret");
  });

  it("validates explicit API perimeter configuration", () => {
    const result = parseConfig(
      {
        DOKEZA_API_ALLOWED_ORIGINS: "https://app.example.com,tauri://localhost",
        DOKEZA_API_MAX_JSON_BODY_BYTES: "2048",
        DOKEZA_API_RATE_LIMIT_WINDOW_MS: "1000",
        DOKEZA_API_RATE_LIMIT_MAX_REQUESTS: "5",
      },
      "api",
    );
    expect(result.config?.api).toEqual({
      allowedOrigins: ["https://app.example.com", "tauri://localhost"],
      maxJsonBodyBytes: 2048,
      rateLimitWindowMs: 1000,
      rateLimitMaxRequests: 5,
    });

    const invalid = parseConfig(
      {
        DOKEZA_API_ALLOWED_ORIGINS: "https://app.example.com/path",
        DOKEZA_API_MAX_JSON_BODY_BYTES: "0",
      },
      "api",
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toContain(
      "DOKEZA_API_ALLOWED_ORIGINS must contain comma-separated http, https, or tauri origins.",
    );
    expect(invalid.errors).toContain("DOKEZA_API_MAX_JSON_BODY_BYTES must be a positive integer.");
  });

  it("defaults hosted runtime environments to the restricted PostgreSQL role", () => {
    const result = parseConfig(
      {
        DOKEZA_ENV: "preview",
        DOKEZA_AUTH_SIGNING_SECRET: "configured_secret_with_at_least_32_chars",
        DOKEZA_REALTIME_PERSISTENCE: "postgres",
        DATABASE_URL: "postgres://runtime@example.com:5432/dokeza",
      },
      "api",
    );

    expect(result.ok).toBe(true);
    expect(result.config?.database.role).toBe("dokeza_app");
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

  it("requires hosted auth settings in production without echoing provider values", () => {
    const result = parseConfig(
      {
        DOKEZA_ENV: "production",
        DOKEZA_AUTH_SIGNING_SECRET: "configured_secret_with_at_least_32_chars",
        DOKEZA_HOSTED_AUTH_JWKS_URL: "http://idp.example.com/jwks",
        DEEPGRAM_API_KEY: "dg_real_secret",
        DOKEZA_LLM_PROVIDER: "deterministic",
        DOKEZA_EMBEDDING_PROVIDER: "deterministic",
        DATABASE_URL: "postgres://dokeza:secret@db.example.com:5432/dokeza",
      },
      "api",
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "DOKEZA_HOSTED_AUTH_ISSUER is required when hosted auth is enabled.",
    );
    expect(result.errors).toContain(
      "DOKEZA_HOSTED_AUTH_AUDIENCE is required when hosted auth is enabled.",
    );
    expect(result.errors).toContain(
      "DOKEZA_HOSTED_AUTH_JWKS_URL must use https when hosted auth is enabled.",
    );
    expect(result.errors.join(" ")).not.toContain("idp.example.com");
    expect(result.errors.join(" ")).not.toContain("dg_real_secret");
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
