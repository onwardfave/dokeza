import type { DokezaConfig } from "@dokeza/config";
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

export interface ConfiguredRealtimeServerOptions extends LiveSuggestionServiceFactoryOptions {
  tokenValidator?: RealtimeServerOptions["tokenValidator"];
}

export function createConfiguredRealtimeServer(
  config: DokezaConfig,
  options: ConfiguredRealtimeServerOptions = {},
): RealtimeServerHandle {
  const persistence = createRealtimePersistenceFromConfig(config);
  const tokenValidator =
    options.tokenValidator ??
    createDokezaRealtimeTokenValidator({
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      signingSecret: config.auth.signingSecret,
    });
  const handle = createRealtimeServer({
    tokenValidator,
    sttAdapter: createSttAdapterFromConfig(config),
    transcriptTimelineSink: persistence.transcriptTimelineSink,
    ...(persistence.sessionStore === undefined ? {} : { sessionStore: persistence.sessionStore }),
    liveSuggestionService: createLiveSuggestionServiceFromConfig(config, {
      ...(options.fetchFn === undefined ? {} : { fetchFn: options.fetchFn }),
    }),
    liveSuggestionExternalCallEnabled: config.providers.llm.provider === "openai",
  });

  return {
    ...handle,
    close: async () => {
      try {
        await handle.close();
      } finally {
        await persistence.close();
      }
    },
  };
}
