import type { DokezaConfig } from "@dokeza/config";
import { createKnowledgePersistenceFromConfig } from "@dokeza/knowledge";
import { createDokezaRealtimeTokenValidator } from "./realtime-token-validator.js";
import { createRealtimePersistenceFromConfig } from "./realtime-persistence-factory.js";
import { createSttAdapterFromConfig } from "./stt-adapter-factory.js";
import {
  createRealtimeServer,
  type RealtimeServerHandle,
  type RealtimeServerOptions,
} from "./ws-server.js";
import {
  createLiveSuggestionServiceFromConfig,
  type LiveSuggestionServiceFactoryOptions,
} from "./live-suggestion-service-factory.js";
import { estimateUsageCostMicrousd } from "./usage-ledger.js";

export interface ConfiguredRealtimeServerOptions extends LiveSuggestionServiceFactoryOptions {
  tokenValidator?: RealtimeServerOptions["tokenValidator"];
}

export function isExternalLiveSuggestionProvider(
  provider: DokezaConfig["providers"]["llm"]["provider"],
): boolean {
  return provider !== "deterministic";
}

export function createConfiguredRealtimeServer(
  config: DokezaConfig,
  options: ConfiguredRealtimeServerOptions = {},
): RealtimeServerHandle {
  const persistence = createRealtimePersistenceFromConfig(config);
  const knowledgePersistence = createKnowledgePersistenceFromConfig(config);
  const tokenValidator =
    options.tokenValidator ??
    createDokezaRealtimeTokenValidator({
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      signingSecret: config.auth.signingSecret,
    });
  const liveSuggestionMaxRequestCostMicrousd = estimateUsageCostMicrousd(
    {
      inputTokens: config.usage.liveSuggestion.maxInputTokens,
      outputTokens: config.usage.liveSuggestion.maxOutputTokens,
    },
    config.usage.liveSuggestion,
  );
  const handle = createRealtimeServer({
    tokenValidator,
    sttAdapter: createSttAdapterFromConfig(config),
    transcriptTimelineSink: persistence.transcriptTimelineSink,
    suggestionSink: persistence.suggestionSink,
    usageLedger: persistence.usageLedger,
    workspacePolicyResolver: persistence.workspacePolicyResolver,
    ...(persistence.sessionStore === undefined ? {} : { sessionStore: persistence.sessionStore }),
    liveSuggestionService: createLiveSuggestionServiceFromConfig(config, {
      ...(options.fetchFn === undefined ? {} : { fetchFn: options.fetchFn }),
    }),
    liveSuggestionSourceRetriever: {
      async search(input) {
        const response = await knowledgePersistence.repository.search({
          workspaceId: input.workspaceId,
          query: input.query,
          topK: input.topK,
        });
        return {
          results: response.results.map((result) => ({
            document_id: result.document_id,
            title: result.title,
            chunk_id: result.chunk_id,
            text: result.text,
            score: result.score,
          })),
        };
      },
    },
    liveSuggestionExternalCallEnabled: isExternalLiveSuggestionProvider(
      config.providers.llm.provider,
    ),
    sttExternalCallEnabled: true,
    liveSuggestionSessionCostLimitMicrousd: config.usage.liveSuggestion.sessionCostLimitMicrousd,
    ...(liveSuggestionMaxRequestCostMicrousd === undefined
      ? {}
      : { liveSuggestionMaxRequestCostMicrousd }),
  });

  return {
    ...handle,
    close: async () => {
      try {
        await handle.close();
      } finally {
        await Promise.all([persistence.close(), knowledgePersistence.close()]);
      }
    },
  };
}
