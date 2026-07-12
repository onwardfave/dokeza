import type { RealtimeJsonMessage } from "@dokeza/contracts";
import { and, eq } from "drizzle-orm";
import { suggestions, withWorkspaceTransaction, type Database } from "@dokeza/db";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";
import type { TranscriptRetentionMode } from "./transcript-retention-policy.js";

type SuggestionCompletePayload = Extract<
  RealtimeJsonMessage,
  { type: "suggestion.complete" }
>["payload"];

export type SuggestionWriteStatus = "recorded" | "updated" | "ignored";

export interface SuggestionWriteInput {
  workspaceId: string;
  sessionId: string;
  actorUserId: string;
  serverSeq: number;
  payload: SuggestionCompletePayload;
  retentionMode?: TranscriptRetentionMode;
}

export interface SuggestionRecord {
  workspaceId: string;
  sessionId: string;
  actorUserId: string;
  serverSeq: number;
  payload: SuggestionCompletePayload;
  createdAt: string;
}

export interface SuggestionWriteResult {
  status: SuggestionWriteStatus;
  telemetry: TelemetryEvent[];
}

export interface SuggestionSink {
  recordSuggestion(input: SuggestionWriteInput): Promise<SuggestionWriteResult>;
}

export interface InMemorySuggestionSinkOptions {
  retentionMode?: TranscriptRetentionMode;
  now?: () => Date;
}

export class InMemorySuggestionSink implements SuggestionSink {
  private readonly retentionMode: TranscriptRetentionMode;
  private readonly now: () => Date;
  private readonly suggestionsById = new Map<string, SuggestionRecord>();

  constructor(options: InMemorySuggestionSinkOptions = {}) {
    this.retentionMode = options.retentionMode ?? "7_days";
    this.now = options.now ?? (() => new Date());
  }

  async recordSuggestion(input: SuggestionWriteInput): Promise<SuggestionWriteResult> {
    const decision = evaluateSuggestionPersistence({
      retentionMode: input.retentionMode ?? this.retentionMode,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });
    if (decision.action === "skip") {
      return { status: "ignored", telemetry: [decision.telemetry] };
    }

    const key = suggestionKey(input.workspaceId, input.payload.suggestion_id);
    const existing = this.suggestionsById.get(key);
    if (
      existing !== undefined &&
      (existing.workspaceId !== input.workspaceId || existing.sessionId !== input.sessionId)
    ) {
      throw new Error("Suggestion scope mismatch.");
    }

    this.suggestionsById.set(key, {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      actorUserId: input.actorUserId,
      serverSeq: input.serverSeq,
      payload: input.payload,
      createdAt: existing?.createdAt ?? this.now().toISOString(),
    });

    return {
      status: existing === undefined ? "recorded" : "updated",
      telemetry: [
        createTelemetryEvent("realtime.suggestion_written", {
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          suggestionId: input.payload.suggestion_id,
          requestId: input.payload.request_id,
          kind: input.payload.kind,
          sourceCount: input.payload.sources.length,
          serverSeq: input.serverSeq,
          status: existing === undefined ? "recorded" : "updated",
        }),
      ],
    };
  }

  getSnapshot(workspaceId: string, sessionId: string): SuggestionRecord[] {
    return [...this.suggestionsById.values()]
      .filter((record) => record.workspaceId === workspaceId && record.sessionId === sessionId)
      .sort((left, right) => left.serverSeq - right.serverSeq);
  }
}

export interface PgSuggestionSinkOptions {
  db: Database;
  retentionMode: TranscriptRetentionMode | string;
}

export class PgSuggestionSink implements SuggestionSink {
  private readonly db: Database;
  private readonly retentionMode: TranscriptRetentionMode | string;

  constructor(options: PgSuggestionSinkOptions) {
    this.db = options.db;
    this.retentionMode = options.retentionMode;
  }

  async recordSuggestion(input: SuggestionWriteInput): Promise<SuggestionWriteResult> {
    const decision = evaluateSuggestionPersistence({
      retentionMode: input.retentionMode ?? this.retentionMode,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
    });
    if (decision.action === "skip") {
      return { status: "ignored", telemetry: [decision.telemetry] };
    }

    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const existing = await tx
        .select({
          id: suggestions.id,
          workspaceId: suggestions.workspaceId,
          meetingSessionId: suggestions.meetingSessionId,
        })
        .from(suggestions)
        .where(
          and(
            eq(suggestions.id, input.payload.suggestion_id),
            eq(suggestions.workspaceId, input.workspaceId),
          ),
        );

      const values = {
        requestId: input.payload.request_id,
        kind: input.payload.kind,
        content: input.payload.content,
        sourcesJson: JSON.stringify(input.payload.sources),
        confidence: input.payload.confidence,
        promptVersion: input.payload.prompt_version,
        model: input.payload.model,
        serverSeq: input.serverSeq,
        createdBy: input.actorUserId,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        const existingSuggestion = existing[0];
        if (
          existingSuggestion?.workspaceId !== input.workspaceId ||
          existingSuggestion.meetingSessionId !== input.sessionId
        ) {
          throw new Error("Suggestion scope mismatch.");
        }

        await tx
          .update(suggestions)
          .set(values)
          .where(
            and(
              eq(suggestions.id, input.payload.suggestion_id),
              eq(suggestions.workspaceId, input.workspaceId),
              eq(suggestions.meetingSessionId, input.sessionId),
            ),
          );

        return createSuggestionWriteResult(input, "updated");
      }

      await tx.insert(suggestions).values({
        id: input.payload.suggestion_id,
        workspaceId: input.workspaceId,
        meetingSessionId: input.sessionId,
        ...values,
      });

      return createSuggestionWriteResult(input, "recorded");
    });
  }
}

function createSuggestionWriteResult(
  input: SuggestionWriteInput,
  status: "recorded" | "updated",
): SuggestionWriteResult {
  return {
    status,
    telemetry: [
      createTelemetryEvent("realtime.suggestion_written", {
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        suggestionId: input.payload.suggestion_id,
        requestId: input.payload.request_id,
        kind: input.payload.kind,
        sourceCount: input.payload.sources.length,
        serverSeq: input.serverSeq,
        status,
      }),
    ],
  };
}

function evaluateSuggestionPersistence(input: {
  retentionMode: TranscriptRetentionMode | string;
  workspaceId: string;
  sessionId: string;
}): {
  action: "persist" | "skip";
  telemetry: TelemetryEvent;
} {
  const action =
    input.retentionMode === "7_days" ||
    input.retentionMode === "30_days" ||
    input.retentionMode === "1_year" ||
    input.retentionMode === "indefinite"
      ? "persist"
      : "skip";

  return {
    action,
    telemetry: createTelemetryEvent("realtime.suggestion_retention_decision", {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      retentionMode: input.retentionMode,
      action,
    }),
  };
}

function suggestionKey(workspaceId: string, suggestionId: string): string {
  return `${workspaceId}\0${suggestionId}`;
}
