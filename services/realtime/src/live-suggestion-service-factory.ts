import type { DokezaConfig } from "@dokeza/config";
import {
  createOpenAiChatCompletionsFetchTransport,
  createOpenAiResponsesFetchTransport,
  DeterministicLiveSuggestionProvider,
  LiveSuggestionService,
  OpenAiChatCompletionsLiveSuggestionProvider,
  OpenAiResponsesLiveSuggestionProvider,
  type LiveSuggestionProvider,
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
      budgets: config.usage.liveSuggestion,
    });
  }

  const apiKey = llmConfig.openai.apiKey;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("OPENAI_API_KEY is required for live suggestions.");
  }

  const fetchOverride = options.fetchFn === undefined ? {} : { fetchFn: options.fetchFn };
  let provider: LiveSuggestionProvider;

  if (llmConfig.provider === "openai_chat") {
    provider = new OpenAiChatCompletionsLiveSuggestionProvider(
      createOpenAiChatCompletionsFetchTransport({
        apiKey,
        baseUrl: llmConfig.openai.baseUrl,
        timeoutMs: llmConfig.openai.timeoutMs,
        ...fetchOverride,
      }),
      llmConfig.openai.model,
    );
  } else {
    provider = new OpenAiResponsesLiveSuggestionProvider(
      createOpenAiResponsesFetchTransport({
        apiKey,
        baseUrl: llmConfig.openai.baseUrl,
        timeoutMs: llmConfig.openai.timeoutMs,
        ...fetchOverride,
      }),
      llmConfig.openai.model,
    );
  }

  return new LiveSuggestionService({
    provider,
    budgets: config.usage.liveSuggestion,
  });
}
