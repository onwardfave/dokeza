import type { DokezaConfig } from "@dokeza/config";
import { DeepgramSttAdapter } from "./deepgram-stt-adapter.js";
import { DeterministicSttAdapter, type SttAdapter } from "./stt-adapter.js";

export function createSttAdapterFromConfig(config: DokezaConfig): SttAdapter {
  const sttConfig = config.providers.stt;

  if (sttConfig.provider !== "deepgram") {
    return new DeterministicSttAdapter();
  }

  const apiKey = sttConfig.deepgram.apiKey;
  if (apiKey === undefined || apiKey.length === 0) {
    if (config.environment === "local" || config.environment === "test") {
      return new DeterministicSttAdapter();
    }

    throw new Error("Deepgram API key is required for realtime STT.");
  }

  return new DeepgramSttAdapter({
    ...sttConfig.deepgram,
    apiKey,
  });
}
