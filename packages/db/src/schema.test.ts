import { describe, expect, it } from "vitest";
import {
  documentChunks,
  integrationConnections,
  meetingSessions,
  workspacePolicies,
} from "./schema.js";

interface RuntimeColumn {
  columnType: string;
  dataType: string;
  hasDefault: boolean;
  notNull: boolean;
}

function column(value: unknown): RuntimeColumn {
  return value as RuntimeColumn;
}

describe("database schema", () => {
  it("models workspace policy flags as booleans to match the SQL migration", () => {
    expect(column(workspacePolicies.cloudSttAllowed).columnType).toBe("PgBoolean");
    expect(column(workspacePolicies.cloudLlmAllowed).columnType).toBe("PgBoolean");
    expect(column(workspacePolicies.screenContextAllowed).columnType).toBe("PgBoolean");
    expect(column(workspacePolicies.directProviderSttAllowed).columnType).toBe("PgBoolean");
    expect(column(workspacePolicies.promptContentLoggingAllowed).columnType).toBe("PgBoolean");
  });

  it("models migration array fields for permissions and integration scopes", () => {
    expect(column(documentChunks.permissionTags).columnType).toBe("PgArray");
    expect(column(documentChunks.permissionTags).notNull).toBe(true);
    expect(column(documentChunks.permissionTags).hasDefault).toBe(true);

    expect(column(integrationConnections.scopes).columnType).toBe("PgArray");
    expect(column(integrationConnections.scopes).notNull).toBe(true);
    expect(column(integrationConnections.scopes).hasDefault).toBe(true);
  });

  it("includes session recovery columns from the second migration", () => {
    expect(column(meetingSessions.lastClientSeq).columnType).toBe("PgInteger");
    expect(column(meetingSessions.lastServerSeq).columnType).toBe("PgInteger");
    expect(column(meetingSessions.connectionId).columnType).toBe("PgText");
  });

  it("keeps generated-id defaults where the SQL migration defines them", () => {
    expect(column(workspacePolicies.id).hasDefault).toBe(true);
  });
});
