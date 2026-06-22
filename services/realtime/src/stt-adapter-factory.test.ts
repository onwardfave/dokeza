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
          DEEPGRAM_API_KEY: "dg_test_secret",
          DEEPGRAM_ENDPOINT: "wss://api.deepgram.com/v1/listen",
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
