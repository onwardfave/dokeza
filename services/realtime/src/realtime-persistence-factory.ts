import type { DokezaConfig } from "@dokeza/config";
import { closePool, createDatabase, createPool } from "@dokeza/db";
import { PgSessionStore, type SessionStore } from "./session-store.js";
import { PgTranscriptTimelineSink } from "./pg-transcript-timeline-sink.js";
import {
  InMemoryTranscriptTimelineSink,
  type TranscriptTimelineSink,
} from "./transcript-timeline.js";
import { InMemorySuggestionSink, PgSuggestionSink, type SuggestionSink } from "./suggestion-sink.js";

export interface RealtimePersistence {
  transcriptTimelineSink: TranscriptTimelineSink;
  suggestionSink: SuggestionSink;
  sessionStore?: SessionStore;
  close(): Promise<void>;
}

export function createRealtimePersistenceFromConfig(config: DokezaConfig): RealtimePersistence {
  if (config.database.realtimePersistence === "memory") {
    return {
      transcriptTimelineSink: new InMemoryTranscriptTimelineSink(),
      suggestionSink: new InMemorySuggestionSink({
        retentionMode: config.retentionDefaults.individual,
      }),
      close: async () => undefined,
    };
  }

  if (config.database.url === undefined) {
    throw new Error("DATABASE_URL is required for PostgreSQL realtime persistence.");
  }

  const pool = createPool(config.database.url, { max: config.database.poolMax });
  const db = createDatabase(pool);

  return {
    transcriptTimelineSink: new PgTranscriptTimelineSink({
      db,
      retentionMode: config.retentionDefaults.individual,
    }),
    suggestionSink: new PgSuggestionSink({
      db,
      retentionMode: config.retentionDefaults.individual,
    }),
    sessionStore: new PgSessionStore(db),
    close: async () => {
      await closePool(pool);
    },
  };
}
