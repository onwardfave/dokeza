import type { DokezaConfig } from "@dokeza/config";
import { closePool, createDatabase, createPool } from "@dokeza/db";
import { PgSessionStore, type SessionStore } from "./session-store.js";
import { PgTranscriptTimelineSink } from "./pg-transcript-timeline-sink.js";
import {
  InMemoryTranscriptTimelineSink,
  type TranscriptTimelineSink,
} from "./transcript-timeline.js";
import {
  InMemorySuggestionSink,
  PgSuggestionSink,
  type SuggestionSink,
} from "./suggestion-sink.js";
import {
  createDefaultPolicyFromConfig,
  PgWorkspacePolicyResolver,
  StaticWorkspacePolicyResolver,
  type WorkspacePolicyResolver,
} from "./workspace-policy-resolver.js";

export interface RealtimePersistence {
  transcriptTimelineSink: TranscriptTimelineSink;
  suggestionSink: SuggestionSink;
  workspacePolicyResolver: WorkspacePolicyResolver;
  sessionStore?: SessionStore;
  close(): Promise<void>;
}

export function createRealtimePersistenceFromConfig(config: DokezaConfig): RealtimePersistence {
  if (config.database.realtimePersistence === "memory") {
    const defaultPolicy = createDefaultPolicyFromConfig(config);
    return {
      transcriptTimelineSink: new InMemoryTranscriptTimelineSink(),
      suggestionSink: new InMemorySuggestionSink({
        retentionMode: config.retentionDefaults.individual,
      }),
      workspacePolicyResolver: new StaticWorkspacePolicyResolver(defaultPolicy),
      close: async () => undefined,
    };
  }

  if (config.database.url === undefined) {
    throw new Error("DATABASE_URL is required for PostgreSQL realtime persistence.");
  }

  const pool = createPool(config.database.url, {
    max: config.database.poolMax,
    ...(config.database.role === undefined ? {} : { role: config.database.role }),
  });
  const db = createDatabase(pool);
  const defaultPolicy = createDefaultPolicyFromConfig(config);

  return {
    transcriptTimelineSink: new PgTranscriptTimelineSink({
      db,
      retentionMode: config.retentionDefaults.individual,
    }),
    suggestionSink: new PgSuggestionSink({
      db,
      retentionMode: config.retentionDefaults.individual,
    }),
    workspacePolicyResolver: new PgWorkspacePolicyResolver(db, defaultPolicy),
    sessionStore: new PgSessionStore(db),
    close: async () => {
      await closePool(pool);
    },
  };
}
