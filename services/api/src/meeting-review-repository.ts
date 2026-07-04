import type {
  MeetingDeleteResponse,
  MeetingDetailResponse,
  MeetingExportResponse,
  MeetingHistoryResponse,
  MeetingSuggestion,
  MeetingSummary,
  MeetingTranscriptGap,
  MeetingTranscriptSegment,
} from "@dokeza/contracts";
import {
  closePool,
  createDatabase,
  createPool,
  meetingSessions,
  suggestions,
  transcriptGaps,
  transcriptSegments,
  withWorkspaceTransaction,
  workspacePolicies,
  type Database,
} from "@dokeza/db";
import type { DokezaConfig } from "@dokeza/config";
import { and, count, desc, eq, ilike, inArray, lt } from "drizzle-orm";

export type MeetingExportFormat = MeetingExportResponse["format"];
export type MeetingReviewRetentionMode =
  | "live_only"
  | "local_only"
  | "7_days"
  | "30_days"
  | "1_year"
  | "indefinite";

export interface ListMeetingsOptions {
  transcriptQuery?: string;
}

export interface RetentionCleanupInput {
  workspaceId: string;
  now: Date;
}

export interface RetentionCleanupResult {
  workspace_id: string;
  retention_mode: MeetingReviewRetentionMode;
  deleted_count: number;
}

export interface MeetingReviewRepository {
  listMeetings(workspaceId: string, options?: ListMeetingsOptions): Promise<MeetingHistoryResponse>;
  getMeetingDetail(
    workspaceId: string,
    meetingId: string,
  ): Promise<MeetingDetailResponse | undefined>;
  exportMeeting(
    workspaceId: string,
    meetingId: string,
    format: MeetingExportFormat,
  ): Promise<MeetingExportResponse | undefined>;
  deleteMeeting(workspaceId: string, meetingId: string): Promise<MeetingDeleteResponse | undefined>;
  cleanupExpiredMeetings(input: RetentionCleanupInput): Promise<RetentionCleanupResult>;
}

export interface MeetingReviewSeed {
  meeting: MeetingSummary;
  segments?: MeetingTranscriptSegment[];
  gaps?: MeetingTranscriptGap[];
  suggestions?: MeetingSuggestion[];
}

interface StoredMeetingReview {
  meeting: MeetingSummary;
  segments: MeetingTranscriptSegment[];
  gaps: MeetingTranscriptGap[];
  suggestions: MeetingSuggestion[];
}

export interface InMemoryMeetingReviewRepositoryOptions {
  seeds?: MeetingReviewSeed[];
  retentionMode?: MeetingReviewRetentionMode;
}

export class InMemoryMeetingReviewRepository implements MeetingReviewRepository {
  private readonly meetings = new Map<string, StoredMeetingReview>();
  private readonly retentionMode: MeetingReviewRetentionMode;

  constructor(seedsOrOptions: MeetingReviewSeed[] | InMemoryMeetingReviewRepositoryOptions = []) {
    const options = Array.isArray(seedsOrOptions) ? { seeds: seedsOrOptions } : seedsOrOptions;
    this.retentionMode = options.retentionMode ?? "30_days";
    for (const seed of options.seeds ?? []) {
      this.upsert(seed);
    }
  }

  upsert(seed: MeetingReviewSeed): void {
    this.meetings.set(key(seed.meeting.workspace_id, seed.meeting.meeting_id), {
      meeting: {
        ...seed.meeting,
        segment_count: seed.segments?.length ?? seed.meeting.segment_count,
        gap_count: seed.gaps?.length ?? seed.meeting.gap_count,
      },
      segments: [...(seed.segments ?? [])],
      gaps: [...(seed.gaps ?? [])],
      suggestions: [...(seed.suggestions ?? [])],
    });
  }

  async listMeetings(
    workspaceId: string,
    options: ListMeetingsOptions = {},
  ): Promise<MeetingHistoryResponse> {
    const query = normalizeSearchQuery(options.transcriptQuery);
    const meetings = [...this.meetings.values()]
      .filter((entry) => entry.meeting.workspace_id === workspaceId)
      .filter((entry) => query === undefined || reviewMatchesTranscriptQuery(entry, query))
      .map((entry) => entry.meeting)
      .sort(compareMeetingSummaries);

    return { workspace_id: workspaceId, meetings };
  }

  async getMeetingDetail(
    workspaceId: string,
    meetingId: string,
  ): Promise<MeetingDetailResponse | undefined> {
    const stored = this.meetings.get(key(workspaceId, meetingId));
    if (stored === undefined) {
      return undefined;
    }

    return {
      meeting: stored.meeting,
      transcript: {
        segments: [...stored.segments].sort(
          (left, right) => left.start_ms - right.start_ms || left.end_ms - right.end_ms,
        ),
        gaps: [...stored.gaps].sort(
          (left, right) => left.start_ms - right.start_ms || left.end_ms - right.end_ms,
        ),
      },
      suggestions: [...stored.suggestions].sort(compareMeetingSuggestions),
    };
  }

  async exportMeeting(
    workspaceId: string,
    meetingId: string,
    format: MeetingExportFormat,
  ): Promise<MeetingExportResponse | undefined> {
    const detail = await this.getMeetingDetail(workspaceId, meetingId);
    if (detail === undefined) {
      return undefined;
    }

    return {
      meeting_id: meetingId,
      workspace_id: workspaceId,
      format,
      content_type: format === "markdown" ? "text/markdown" : "application/json",
      content:
        format === "markdown"
          ? toMarkdownExport(detail)
          : JSON.stringify(
              {
                meeting: detail.meeting,
                transcript: detail.transcript,
                suggestions: detail.suggestions,
              },
              null,
              2,
            ),
    };
  }

  async deleteMeeting(
    workspaceId: string,
    meetingId: string,
  ): Promise<MeetingDeleteResponse | undefined> {
    const deleted = this.meetings.delete(key(workspaceId, meetingId));
    if (!deleted) {
      return undefined;
    }

    return {
      meeting_id: meetingId,
      workspace_id: workspaceId,
      deleted: true,
    };
  }

  async cleanupExpiredMeetings(input: RetentionCleanupInput): Promise<RetentionCleanupResult> {
    const cutoff = retentionCutoff(this.retentionMode, input.now);
    if (cutoff === undefined) {
      return {
        workspace_id: input.workspaceId,
        retention_mode: this.retentionMode,
        deleted_count: 0,
      };
    }

    let deletedCount = 0;
    for (const [storedKey, review] of this.meetings.entries()) {
      if (review.meeting.workspace_id !== input.workspaceId) {
        continue;
      }

      const endedAt = review.meeting.ended_at;
      if (endedAt === undefined) {
        continue;
      }

      if (new Date(endedAt).getTime() < cutoff.getTime()) {
        this.meetings.delete(storedKey);
        deletedCount += 1;
      }
    }

    return {
      workspace_id: input.workspaceId,
      retention_mode: this.retentionMode,
      deleted_count: deletedCount,
    };
  }
}

export interface PgMeetingReviewRepositoryOptions {
  db: Database;
  defaultRetentionMode?: MeetingReviewRetentionMode;
}

export class PgMeetingReviewRepository implements MeetingReviewRepository {
  private readonly db: Database;
  private readonly defaultRetentionMode: MeetingReviewRetentionMode;

  constructor(options: PgMeetingReviewRepositoryOptions) {
    this.db = options.db;
    this.defaultRetentionMode = options.defaultRetentionMode ?? "30_days";
  }

  async listMeetings(
    workspaceId: string,
    options: ListMeetingsOptions = {},
  ): Promise<MeetingHistoryResponse> {
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const query = normalizeSearchQuery(options.transcriptQuery);
      const matchingMeetingIds =
        query === undefined ? undefined : await findTranscriptMeetingIds(tx, workspaceId, query);

      if (matchingMeetingIds !== undefined && matchingMeetingIds.length === 0) {
        return { workspace_id: workspaceId, meetings: [] };
      }

      const filters = [eq(meetingSessions.workspaceId, workspaceId)];
      if (matchingMeetingIds !== undefined) {
        filters.push(inArray(meetingSessions.id, matchingMeetingIds));
      }

      const rows = await tx
        .select()
        .from(meetingSessions)
        .where(and(...filters))
        .orderBy(desc(meetingSessions.startedAt), desc(meetingSessions.id));

      const meetings = await Promise.all(
        rows.map(async (row) => {
          const [segmentCount, gapCount] = await Promise.all([
            countSegments(tx, workspaceId, row.id),
            countGaps(tx, workspaceId, row.id),
          ]);
          return toMeetingSummary(row, segmentCount, gapCount);
        }),
      );

      return { workspace_id: workspaceId, meetings };
    });
  }

  async getMeetingDetail(
    workspaceId: string,
    meetingId: string,
  ): Promise<MeetingDetailResponse | undefined> {
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(meetingSessions)
        .where(
          and(eq(meetingSessions.workspaceId, workspaceId), eq(meetingSessions.id, meetingId)),
        );

      const row = rows[0];
      if (row === undefined) {
        return undefined;
      }

      const [segmentRows, gapRows, suggestionRows] = await Promise.all([
        tx
          .select()
          .from(transcriptSegments)
          .where(
            and(
              eq(transcriptSegments.workspaceId, workspaceId),
              eq(transcriptSegments.meetingSessionId, meetingId),
            ),
          )
          .orderBy(transcriptSegments.startMs, transcriptSegments.endMs),
        tx
          .select()
          .from(transcriptGaps)
          .where(
            and(
              eq(transcriptGaps.workspaceId, workspaceId),
              eq(transcriptGaps.meetingSessionId, meetingId),
            ),
          )
          .orderBy(transcriptGaps.startMs, transcriptGaps.endMs),
        tx
          .select()
          .from(suggestions)
          .where(
            and(
              eq(suggestions.workspaceId, workspaceId),
              eq(suggestions.meetingSessionId, meetingId),
            ),
          )
          .orderBy(suggestions.serverSeq, suggestions.createdAt, suggestions.id),
      ]);

      return {
        meeting: toMeetingSummary(row, segmentRows.length, gapRows.length),
        transcript: {
          segments: segmentRows.map(toTranscriptSegment),
          gaps: gapRows.map(toTranscriptGap),
        },
        suggestions: suggestionRows.map(toMeetingSuggestion),
      };
    });
  }

  async exportMeeting(
    workspaceId: string,
    meetingId: string,
    format: MeetingExportFormat,
  ): Promise<MeetingExportResponse | undefined> {
    const detail = await this.getMeetingDetail(workspaceId, meetingId);
    if (detail === undefined) {
      return undefined;
    }

    return toExportResponse(workspaceId, meetingId, format, detail);
  }

  async deleteMeeting(
    workspaceId: string,
    meetingId: string,
  ): Promise<MeetingDeleteResponse | undefined> {
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const existing = await tx
        .select({ id: meetingSessions.id })
        .from(meetingSessions)
        .where(
          and(eq(meetingSessions.workspaceId, workspaceId), eq(meetingSessions.id, meetingId)),
        );

      if (existing.length === 0) {
        return undefined;
      }

      await tx
        .delete(meetingSessions)
        .where(
          and(eq(meetingSessions.workspaceId, workspaceId), eq(meetingSessions.id, meetingId)),
        );

      return {
        meeting_id: meetingId,
        workspace_id: workspaceId,
        deleted: true,
      };
    });
  }

  async cleanupExpiredMeetings(input: RetentionCleanupInput): Promise<RetentionCleanupResult> {
    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const retentionMode = await resolveWorkspaceRetentionMode(
        tx,
        input.workspaceId,
        this.defaultRetentionMode,
      );
      const cutoff = retentionCutoff(retentionMode, input.now);
      if (cutoff === undefined) {
        return {
          workspace_id: input.workspaceId,
          retention_mode: retentionMode,
          deleted_count: 0,
        };
      }

      const expired = await tx
        .select({ id: meetingSessions.id })
        .from(meetingSessions)
        .where(
          and(
            eq(meetingSessions.workspaceId, input.workspaceId),
            eq(meetingSessions.status, "ended"),
            lt(meetingSessions.endedAt, cutoff),
          ),
        );

      const expiredIds = expired.map((row) => row.id);
      if (expiredIds.length === 0) {
        return {
          workspace_id: input.workspaceId,
          retention_mode: retentionMode,
          deleted_count: 0,
        };
      }

      await tx
        .delete(meetingSessions)
        .where(
          and(
            eq(meetingSessions.workspaceId, input.workspaceId),
            inArray(meetingSessions.id, expiredIds),
          ),
        );

      return {
        workspace_id: input.workspaceId,
        retention_mode: retentionMode,
        deleted_count: expiredIds.length,
      };
    });
  }
}

export interface MeetingReviewPersistence {
  repository: MeetingReviewRepository;
  close(): Promise<void>;
}

export function createMeetingReviewPersistenceFromConfig(
  config: DokezaConfig,
): MeetingReviewPersistence {
  if (config.database.realtimePersistence === "memory") {
    return {
      repository: new InMemoryMeetingReviewRepository(),
      close: async () => undefined,
    };
  }

  if (config.database.url === undefined) {
    throw new Error("DATABASE_URL is required for PostgreSQL meeting review persistence.");
  }

  const pool = createPool(config.database.url, { max: config.database.poolMax });
  const db = createDatabase(pool);

  return {
    repository: new PgMeetingReviewRepository({
      db,
      defaultRetentionMode: config.retentionDefaults.individual,
    }),
    close: async () => {
      await closePool(pool);
    },
  };
}

function key(workspaceId: string, meetingId: string): string {
  return `${workspaceId}\0${meetingId}`;
}

function compareMeetingSummaries(left: MeetingSummary, right: MeetingSummary): number {
  const leftTime = left.started_at ?? "";
  const rightTime = right.started_at ?? "";
  return rightTime.localeCompare(leftTime) || right.meeting_id.localeCompare(left.meeting_id);
}

function compareMeetingSuggestions(left: MeetingSuggestion, right: MeetingSuggestion): number {
  return (
    (left.server_seq ?? Number.MAX_SAFE_INTEGER) -
      (right.server_seq ?? Number.MAX_SAFE_INTEGER) ||
    (left.created_at ?? "").localeCompare(right.created_at ?? "") ||
    left.suggestion_id.localeCompare(right.suggestion_id)
  );
}

function normalizeSearchQuery(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const query = value.trim().slice(0, 128).toLowerCase();
  return query.length === 0 ? undefined : query;
}

function reviewMatchesTranscriptQuery(review: StoredMeetingReview, query: string): boolean {
  return review.segments.some((segment) => segment.text.toLowerCase().includes(query));
}

function toExportResponse(
  workspaceId: string,
  meetingId: string,
  format: MeetingExportFormat,
  detail: MeetingDetailResponse,
): MeetingExportResponse {
  return {
    meeting_id: meetingId,
    workspace_id: workspaceId,
    format,
    content_type: format === "markdown" ? "text/markdown" : "application/json",
    content:
      format === "markdown"
        ? toMarkdownExport(detail)
        : JSON.stringify(
            {
              meeting: detail.meeting,
              transcript: detail.transcript,
              suggestions: detail.suggestions,
            },
            null,
            2,
          ),
  };
}

function retentionCutoff(retentionMode: MeetingReviewRetentionMode, now: Date): Date | undefined {
  switch (retentionMode) {
    case "live_only":
    case "local_only":
      return now;
    case "7_days":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30_days":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "1_year":
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case "indefinite":
      return undefined;
  }
}

function readRetentionMode(value: string | undefined): MeetingReviewRetentionMode | undefined {
  if (
    value === "live_only" ||
    value === "local_only" ||
    value === "7_days" ||
    value === "30_days" ||
    value === "1_year" ||
    value === "indefinite"
  ) {
    return value;
  }

  return undefined;
}

async function resolveWorkspaceRetentionMode(
  tx: Database,
  workspaceId: string,
  defaultRetentionMode: MeetingReviewRetentionMode,
): Promise<MeetingReviewRetentionMode> {
  const rows = await tx
    .select({ retentionMode: workspacePolicies.retentionMode })
    .from(workspacePolicies)
    .where(eq(workspacePolicies.workspaceId, workspaceId))
    .orderBy(desc(workspacePolicies.updatedAt))
    .limit(1);

  return readRetentionMode(rows[0]?.retentionMode) ?? defaultRetentionMode;
}

async function findTranscriptMeetingIds(
  tx: Database,
  workspaceId: string,
  query: string,
): Promise<string[]> {
  const rows = await tx
    .select({ meetingSessionId: transcriptSegments.meetingSessionId })
    .from(transcriptSegments)
    .where(
      and(
        eq(transcriptSegments.workspaceId, workspaceId),
        ilike(transcriptSegments.text, `%${query}%`),
      ),
    );

  return [...new Set(rows.map((row) => row.meetingSessionId))];
}

async function countSegments(
  tx: Database,
  workspaceId: string,
  meetingId: string,
): Promise<number> {
  const rows = await tx
    .select({ value: count() })
    .from(transcriptSegments)
    .where(
      and(
        eq(transcriptSegments.workspaceId, workspaceId),
        eq(transcriptSegments.meetingSessionId, meetingId),
      ),
    );
  return rows[0]?.value ?? 0;
}

async function countGaps(tx: Database, workspaceId: string, meetingId: string): Promise<number> {
  const rows = await tx
    .select({ value: count() })
    .from(transcriptGaps)
    .where(
      and(
        eq(transcriptGaps.workspaceId, workspaceId),
        eq(transcriptGaps.meetingSessionId, meetingId),
      ),
    );
  return rows[0]?.value ?? 0;
}

function toMeetingStatus(value: string): MeetingSummary["status"] {
  if (value === "active" || value === "paused" || value === "ended") {
    return value;
  }

  return value === "created" ? "active" : "ended";
}

function toMeetingSummary(
  row: typeof meetingSessions.$inferSelect,
  segmentCount: number,
  gapCount: number,
): MeetingSummary {
  const summary: MeetingSummary = {
    meeting_id: row.id,
    workspace_id: row.workspaceId,
    created_by: row.createdBy,
    meeting_source: row.meetingSource,
    status: toMeetingStatus(row.status),
    segment_count: segmentCount,
    gap_count: gapCount,
  };

  if (row.startedAt !== null) {
    summary.started_at = row.startedAt.toISOString();
  }

  if (row.endedAt !== null) {
    summary.ended_at = row.endedAt.toISOString();
  }

  return summary;
}

function toTranscriptSegment(
  row: typeof transcriptSegments.$inferSelect,
): MeetingTranscriptSegment {
  return {
    segment_id: row.id,
    speaker: row.speaker as MeetingTranscriptSegment["speaker"],
    text: row.text,
    start_ms: row.startMs,
    end_ms: row.endMs,
    confidence: row.confidence === null ? 0 : Number(row.confidence),
  };
}

function toTranscriptGap(row: typeof transcriptGaps.$inferSelect): MeetingTranscriptGap {
  return {
    stream: row.stream as MeetingTranscriptGap["stream"],
    start_ms: row.startMs,
    end_ms: row.endMs,
    dropped_chunks: row.droppedChunks,
    reason: row.reason as MeetingTranscriptGap["reason"],
  };
}

function toMeetingSuggestion(row: typeof suggestions.$inferSelect): MeetingSuggestion {
  const suggestion: MeetingSuggestion = {
    suggestion_id: row.id,
    kind: row.kind as MeetingSuggestion["kind"],
    content: row.content,
    sources: readSuggestionSources(row.sourcesJson),
    confidence: row.confidence as MeetingSuggestion["confidence"],
    prompt_version: row.promptVersion,
    model: row.model,
  };

  if (row.requestId !== null) {
    suggestion.request_id = row.requestId;
  }
  if (row.serverSeq !== null) {
    suggestion.server_seq = row.serverSeq;
  }
  if (row.createdAt !== null) {
    suggestion.created_at = row.createdAt.toISOString();
  }

  return suggestion;
}

function readSuggestionSources(value: string): MeetingSuggestion["sources"] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((source) => {
      if (
        typeof source !== "object" ||
        source === null ||
        typeof (source as { document_id?: unknown }).document_id !== "string" ||
        typeof (source as { title?: unknown }).title !== "string" ||
        typeof (source as { chunk_id?: unknown }).chunk_id !== "string"
      ) {
        return [];
      }

      return [
        {
          document_id: (source as { document_id: string }).document_id,
          title: (source as { title: string }).title,
          chunk_id: (source as { chunk_id: string }).chunk_id,
        },
      ];
    });
  } catch {
    return [];
  }
}

function toMarkdownExport(detail: MeetingDetailResponse): string {
  const lines = [
    `# Meeting ${detail.meeting.meeting_id}`,
    "",
    `- Workspace: ${detail.meeting.workspace_id}`,
    `- Source: ${detail.meeting.meeting_source}`,
    `- Status: ${detail.meeting.status}`,
  ];

  if (detail.meeting.started_at !== undefined) {
    lines.push(`- Started: ${detail.meeting.started_at}`);
  }
  if (detail.meeting.ended_at !== undefined) {
    lines.push(`- Ended: ${detail.meeting.ended_at}`);
  }

  lines.push("", "## Transcript", "");

  if (detail.transcript.segments.length === 0) {
    lines.push("_No transcript segments._");
  } else {
    for (const segment of detail.transcript.segments) {
      lines.push(`- ${segment.start_ms}-${segment.end_ms} ms [${segment.speaker}] ${segment.text}`);
    }
  }

  if (detail.transcript.gaps.length > 0) {
    lines.push("", "## Gaps", "");
    for (const gap of detail.transcript.gaps) {
      lines.push(
        `- ${gap.start_ms}-${gap.end_ms} ms ${gap.stream}: ${gap.reason} (${gap.dropped_chunks} chunks)`,
      );
    }
  }

  lines.push("", "## Suggestions", "");

  if (detail.suggestions.length === 0) {
    lines.push("_No live suggestions._");
  } else {
    for (const suggestion of detail.suggestions) {
      lines.push(`- [${suggestion.kind}] ${suggestion.content}`);
      if (suggestion.sources.length > 0) {
        lines.push(
          `  Sources: ${suggestion.sources
            .map((source) => `${source.title} (${source.document_id}/${source.chunk_id})`)
            .join(", ")}`,
        );
      }
    }
  }

  return `${lines.join("\n")}\n`;
}
