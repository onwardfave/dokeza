import { describe, expect, it } from "vitest";
import { parseConfig, type DokezaConfig } from "@dokeza/config";
import { DeepgramSttAdapter } from "./deepgram-stt-adapter.js";
import { DeterministicSttAdapter } from "./stt-adapter.js";
import { createSttAdapterFromConfig } from "./stt-adapter-factory.js";

function requireConfig(result: ReturnType<typeof parseConfig>): DokezaConfig {
  expect(result.ok).toBe(true);
  if (!result.config) {
    throw new Error("Expected config");
  }

  return result.config;
}

describe("createSttAdapterFromConfig", () => {
  it("uses deterministic STT for local config without provider credentials", () => {
    const config = requireConfig(parseConfig({}, "realtime"));

    const adapter = createSttAdapterFromConfig(config);

    expect(adapter).toBeInstanceOf(DeterministicSttAdapter);
  });

  it("uses Deepgram STT when provider credentials are configured", () => {
    const config = requireConfig(
      parseConfig(
        {
          DOKEZA_ENV: "production",
          DOKEZA_AUTH_SIGNING_SECRET: "configured_secret_with_at_least_32_chars",
          DEEPGRAM_API_KEY: "dg_test_secret",
          DEEPGRAM_ENDPOINT: "wss://api.deepgram.com/v1/listen",
          DOKEZA_LLM_PROVIDER: "deterministic",
          DOKEZA_EMBEDDING_PROVIDER: "deterministic",
          DATABASE_URL: "postgres://dokeza:secret@db.example.com:5432/dokeza",
        },
        "realtime",
      ),
    );

    const adapter = createSttAdapterFromConfig(config);

    expect(adapter).toBeInstanceOf(DeepgramSttAdapter);
  });

  it("fails closed without echoing credentials if Deepgram config is incomplete", () => {
    const config = requireConfig(parseConfig({}, "realtime"));
    const productionConfig: DokezaConfig = {
      ...config,
      environment: "production",
    };

    expect(() => createSttAdapterFromConfig(productionConfig)).toThrow(
      "Deepgram API key is required for realtime STT.",
    );
  });
});
