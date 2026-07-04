import type { DokezaConfig } from "@dokeza/config";
import {
  createOpenAiResponsesFetchTransport,
  DeterministicLiveSuggestionProvider,
  LiveSuggestionService,
  OpenAiResponsesLiveSuggestionProvider,
} from "@dokeza/ai-orchestrator";

export interface LiveSuggestionServiceFactoryOptions {
  fetchFn?: typeof fetch;
}

export function createLiveSuggestionServiceFromConfig(
  config: DokezaConfig,
  options: LiveSuggestionServiceFactoryOptions = {},
): LiveSuggestionService {
  const llmConfig = config.providers.llm;

  if (llmConfig.provider === "deterministic") {
    return new LiveSuggestionService({
      provider: new DeterministicLiveSuggestionProvider(),
    });
  }

  const apiKey = llmConfig.openai.apiKey;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("OPENAI_API_KEY is required for live suggestions.");
  }

  return new LiveSuggestionService({
    provider: new OpenAiResponsesLiveSuggestionProvider(
      createOpenAiResponsesFetchTransport({
        apiKey,
        baseUrl: llmConfig.openai.baseUrl,
        timeoutMs: llmConfig.openai.timeoutMs,
        ...(options.fetchFn === undefined ? {} : { fetchFn: options.fetchFn }),
      }),
      llmConfig.openai.model,
    ),
  });
}
