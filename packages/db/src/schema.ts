/**
 * Drizzle schema for Dokeza.
 *
 * This mirrors the SQL migration at:
 *   infra/db/migrations/0001_workspace_rls_baseline.sql
 *
 * Every tenant-owned table includes `workspace_id` for RLS enforcement.
 * RLS policies use `current_setting('app.current_workspace_id', true)`.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const vector1536 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.map((entry) => Number(entry).toFixed(8)).join(",")}]`;
  },
});

// ---------------------------------------------------------------------------
// Core identity
// ---------------------------------------------------------------------------

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("individual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);

export const userProviderIdentities = pgTable(
  "user_provider_identities",
  {
    providerIssuer: text("provider_issuer").notNull(),
    providerSubject: text("provider_subject").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email"),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.providerIssuer, table.providerSubject] }),
    uniqueIndex("user_provider_identities_user_provider_idx").on(
      table.userId,
      table.providerIssuer,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Workspace policies
// ---------------------------------------------------------------------------

export const workspacePolicies = pgTable("workspace_policies", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  retentionMode: text("retention_mode").notNull().default("30_days"),
  cloudSttAllowed: boolean("cloud_stt_allowed").notNull().default(true),
  cloudLlmAllowed: boolean("cloud_llm_allowed").notNull().default(true),
  screenContextAllowed: boolean("screen_context_allowed").notNull().default(false),
  directProviderSttAllowed: boolean("direct_provider_stt_allowed").notNull().default(false),
  promptContentLoggingAllowed: boolean("prompt_content_logging_allowed").notNull().default(false),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Meeting sessions
// ---------------------------------------------------------------------------

export const meetingSessions = pgTable("meeting_sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  meetingSource: text("meeting_source").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  // Session recovery fields (added in 0002 migration)
  lastClientSeq: integer("last_client_seq"),
  lastServerSeq: integer("last_server_seq"),
  connectionId: text("connection_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export const transcriptSegments = pgTable("transcript_segments", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  meetingSessionId: text("meeting_session_id")
    .notNull()
    .references(() => meetingSessions.id, { onDelete: "cascade" }),
  speaker: text("speaker").notNull(),
  text: text("text").notNull(),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transcriptGaps = pgTable("transcript_gaps", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  meetingSessionId: text("meeting_session_id")
    .notNull()
    .references(() => meetingSessions.id, { onDelete: "cascade" }),
  stream: text("stream").notNull(),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  droppedChunks: integer("dropped_chunks").notNull(),
  reason: text("reason").notNull(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export const suggestions = pgTable("suggestions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  meetingSessionId: text("meeting_session_id")
    .notNull()
    .references(() => meetingSessions.id, { onDelete: "cascade" }),
  requestId: text("request_id"),
  kind: text("kind").notNull(),
  content: text("content").notNull(),
  sourcesJson: text("sources_json").notNull().default("[]"),
  confidence: text("confidence").notNull(),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  serverSeq: integer("server_seq"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Metadata-only provider usage ledger
// ---------------------------------------------------------------------------

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()::text`),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    meetingSessionId: text("meeting_session_id")
      .notNull()
      .references(() => meetingSessions.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    feature: text("feature").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").notNull(),
    tokenEstimationMethod: text("token_estimation_method").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    transcriptTokens: integer("transcript_tokens").notNull(),
    sourceTokens: integer("source_tokens").notNull(),
    userPromptTokens: integer("user_prompt_tokens").notNull(),
    systemTokens: integer("system_tokens").notNull(),
    sourceCount: integer("source_count").notNull(),
    estimatedCostMicrousd: integer("estimated_cost_microusd"),
    costEstimateStatus: text("cost_estimate_status").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("usage_events_scope_unique").on(
      table.workspaceId,
      table.meetingSessionId,
      table.requestId,
      table.feature,
    ),
    index("usage_events_workspace_session_created_idx").on(
      table.workspaceId,
      table.meetingSessionId,
      table.createdAt.desc(),
    ),
  ],
);

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").references(() => users.id),
  title: text("title").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    embedding: vector1536("embedding"),
    permissionTags: text("permission_tags")
      .array()
      .notNull()
      .default(sql`array[]::text[]`),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.documentId, table.chunkIndex)],
);

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export const integrationConnections = pgTable("integration_connections", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`array[]::text[]`),
  status: text("status").notNull(),
  secretRef: text("secret_ref").notNull(),
  createdBy: text("created_by").references(() => users.id),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const auditLogs = pgTable("audit_logs", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
