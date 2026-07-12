import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type DokezaConfig } from "@dokeza/config";
import { closePool, createDatabase, createPool } from "@dokeza/db";
import { InMemoryTranscriptTimelineSink } from "./transcript-timeline.js";
import { PgTranscriptTimelineSink } from "./pg-transcript-timeline-sink.js";
import { PgSessionStore } from "./session-store.js";
import { createRealtimePersistenceFromConfig } from "./realtime-persistence-factory.js";
import {
  PgWorkspacePolicyResolver,
  StaticWorkspacePolicyResolver,
} from "./workspace-policy-resolver.js";

vi.mock("@dokeza/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dokeza/db")>();
  return {
    ...actual,
    createPool: vi.fn().mockReturnValue({ pool: "postgres" }),
    createDatabase: vi.fn().mockReturnValue({ db: "drizzle" }),
    closePool: vi.fn().mockResolvedValue(undefined),
  };
});

function requireConfig(result: ReturnType<typeof parseConfig>): DokezaConfig {
  expect(result.ok).toBe(true);
  if (!result.config) {
    throw new Error("Expected config");
  }

  return result.config;
}

describe("createRealtimePersistenceFromConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses in-memory transcript persistence for local config by default", async () => {
    const config = requireConfig(parseConfig({}, "realtime"));

    const persistence = createRealtimePersistenceFromConfig(config);

    expect(persistence.transcriptTimelineSink).toBeInstanceOf(InMemoryTranscriptTimelineSink);
    expect(persistence.workspacePolicyResolver).toBeInstanceOf(StaticWorkspacePolicyResolver);
    expect(persistence.sessionStore).toBeUndefined();
    await persistence.close();
    expect(createPool).not.toHaveBeenCalled();
  });

  it("creates PostgreSQL stores when realtime persistence is configured for postgres", async () => {
    const config = requireConfig(
      parseConfig(
        {
          DOKEZA_REALTIME_PERSISTENCE: "postgres",
          DATABASE_URL: "postgres://dokeza:secret@localhost:5432/dokeza",
          DATABASE_POOL_MAX: "4",
          DOKEZA_DATABASE_ROLE: "dokeza_app",
        },
        "realtime",
      ),
    );

    const persistence = createRealtimePersistenceFromConfig(config);

    expect(createPool).toHaveBeenCalledWith("postgres://dokeza:secret@localhost:5432/dokeza", {
      max: 4,
      role: "dokeza_app",
    });
    expect(createDatabase).toHaveBeenCalledWith({ pool: "postgres" });
    expect(persistence.transcriptTimelineSink).toBeInstanceOf(PgTranscriptTimelineSink);
    expect(persistence.sessionStore).toBeInstanceOf(PgSessionStore);
    expect(persistence.workspacePolicyResolver).toBeInstanceOf(PgWorkspacePolicyResolver);

    await persistence.close();
    expect(closePool).toHaveBeenCalledWith({ pool: "postgres" });
  });
});
