import { randomUUID } from "node:crypto";
import { authorizeWorkspace, type Actor } from "@dokeza/authz";
import type {
  KnowledgeDocumentChunk,
  KnowledgeDocumentDetailResponse,
  KnowledgeDocumentListResponse,
  KnowledgeDocumentSummary,
  KnowledgeDocumentUploadResponse,
  KnowledgeSearchResponse,
} from "@dokeza/contracts";
import {
  closePool,
  createDatabase,
  createPool,
  documentChunks,
  documents,
  withWorkspaceTransaction,
  workspacePolicies,
  type Database,
} from "@dokeza/db";
import type { DokezaConfig } from "@dokeza/config";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";

export type KnowledgeRetentionMode =
  | "live_only"
  | "local_only"
  | "7_days"
  | "30_days"
  | "1_year"
  | "indefinite";

export interface RetrievalRequest {
  workspaceId: string;
  actorUserId: string;
  query: string;
  topK: number;
  allowedDocumentIds?: readonly string[];
}

export interface UploadKnowledgeDocumentInput {
  workspaceId: string;
  actorUserId: string;
  title: string;
  source: string;
  text: string;
  permissionTags?: readonly string[];
}

export interface SearchKnowledgeInput {
  workspaceId: string;
  query: string;
  topK?: number;
  allowedDocumentIds?: readonly string[];
}

export interface KnowledgeRepository {
  uploadDocument(input: UploadKnowledgeDocumentInput): Promise<KnowledgeDocumentUploadResponse>;
  listDocuments(workspaceId: string): Promise<KnowledgeDocumentListResponse>;
  getDocumentDetail(
    workspaceId: string,
    documentId: string,
  ): Promise<KnowledgeDocumentDetailResponse | undefined>;
  search(input: SearchKnowledgeInput): Promise<KnowledgeSearchResponse>;
}

export class KnowledgeRepositoryError extends Error {
  readonly code: "invalid_request" | "knowledge_storage_blocked";

  constructor(code: KnowledgeRepositoryError["code"]) {
    super(code);
    this.code = code;
  }
}

export function createRetrievalRequest(
  actor: Actor,
  workspaceId: string,
  query: string,
  topK = 5,
  allowedDocumentIds?: readonly string[],
): RetrievalRequest {
  const authorization = authorizeWorkspace(actor, workspaceId);
  if (!authorization.allowed) {
    throw new Error(`workspace_access_denied:${authorization.reason}`);
  }

  if (query.trim().length === 0) {
    throw new Error("retrieval_query_required");
  }

  return {
    workspaceId,
    actorUserId: actor.userId,
    query,
    topK,
    ...(allowedDocumentIds === undefined ? {} : { allowedDocumentIds }),
  };
}

export function chunkDocumentText(text: string, maxChunkChars = 900): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[^\S\n]+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkChars) {
      flushCurrent();
      chunks.push(...splitLongParagraph(paragraph, maxChunkChars));
      continue;
    }

    const candidate = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length <= maxChunkChars) {
      current = candidate;
      continue;
    }

    flushCurrent();
    current = paragraph;
  }

  flushCurrent();
  return chunks;

  function flushCurrent(): void {
    if (current.length === 0) {
      return;
    }
    chunks.push(current);
    current = "";
  }
}

export interface InMemoryKnowledgeRepositoryOptions {
  seeds?: KnowledgeDocumentDetailResponse[];
  retentionMode?: KnowledgeRetentionMode;
  now?: () => Date;
  idGenerator?: () => string;
}

interface StoredKnowledgeDocument {
  document: KnowledgeDocumentSummary;
  chunks: KnowledgeDocumentChunk[];
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly documentsByKey = new Map<string, StoredKnowledgeDocument>();
  private readonly retentionMode: KnowledgeRetentionMode;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(options: InMemoryKnowledgeRepositoryOptions = {}) {
    this.retentionMode = options.retentionMode ?? "30_days";
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());

    for (const seed of options.seeds ?? []) {
      this.upsert(seed);
    }
  }

  upsert(seed: KnowledgeDocumentDetailResponse): void {
    const document = {
      ...seed.document,
      chunk_count: seed.chunks.length,
    };
    this.documentsByKey.set(key(document.workspace_id, document.document_id), {
      document,
      chunks: [...seed.chunks].sort(compareChunks),
    });
  }

  async uploadDocument(
    input: UploadKnowledgeDocumentInput,
  ): Promise<KnowledgeDocumentUploadResponse> {
    assertStorageAllowed(this.retentionMode);
    const chunks = chunkDocumentText(input.text);
    if (
      chunks.length === 0 ||
      input.title.trim().length === 0 ||
      input.source.trim().length === 0
    ) {
      throw new KnowledgeRepositoryError("invalid_request");
    }

    const documentId = `doc_${this.idGenerator()}`;
    const timestamp = this.now().toISOString();
    const permissionTags = normalizePermissionTags(input.permissionTags);
    const document: KnowledgeDocumentSummary = {
      document_id: documentId,
      workspace_id: input.workspaceId,
      title: input.title.trim(),
      source: input.source.trim(),
      status: "active",
      chunk_count: chunks.length,
      created_by: input.actorUserId,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const storedChunks = chunks.map((text, index) => ({
      chunk_id: `chunk_${this.idGenerator()}`,
      document_id: documentId,
      chunk_index: index,
      text,
      permission_tags: permissionTags,
    }));

    const detail = { document, chunks: storedChunks };
    this.upsert(detail);
    return detail;
  }

  async listDocuments(workspaceId: string): Promise<KnowledgeDocumentListResponse> {
    const documentsForWorkspace = [...this.documentsByKey.values()]
      .map((stored) => stored.document)
      .filter((document) => document.workspace_id === workspaceId && document.status !== "deleted")
      .sort(compareDocuments);

    return { workspace_id: workspaceId, documents: documentsForWorkspace };
  }

  async getDocumentDetail(
    workspaceId: string,
    documentId: string,
  ): Promise<KnowledgeDocumentDetailResponse | undefined> {
    const stored = this.documentsByKey.get(key(workspaceId, documentId));
    if (stored === undefined || stored.document.status === "deleted") {
      return undefined;
    }

    return {
      document: stored.document,
      chunks: [...stored.chunks].sort(compareChunks),
    };
  }

  async search(input: SearchKnowledgeInput): Promise<KnowledgeSearchResponse> {
    const terms = tokenizeQuery(input.query);
    if (terms.length === 0) {
      throw new KnowledgeRepositoryError("invalid_request");
    }

    const allowedDocumentIds =
      input.allowedDocumentIds === undefined ? undefined : new Set(input.allowedDocumentIds);
    const results = [...this.documentsByKey.values()]
      .filter((stored) => stored.document.workspace_id === input.workspaceId)
      .filter((stored) => stored.document.status === "active")
      .filter(
        (stored) =>
          allowedDocumentIds === undefined || allowedDocumentIds.has(stored.document.document_id),
      )
      .flatMap((stored) =>
        stored.chunks.map((chunk) => ({
          document_id: stored.document.document_id,
          title: stored.document.title,
          source: stored.document.source,
          chunk_id: chunk.chunk_id,
          chunk_index: chunk.chunk_index,
          text: chunk.text,
          score: scoreChunk(chunk.text, terms),
        })),
      )
      .filter((result) => result.score > 0)
      .sort(compareSearchResults)
      .slice(0, clampTopK(input.topK));

    return { workspace_id: input.workspaceId, query: input.query.trim(), results };
  }
}

export interface PgKnowledgeRepositoryOptions {
  db: Database;
  defaultRetentionMode?: KnowledgeRetentionMode;
  now?: () => Date;
  idGenerator?: () => string;
}

export class PgKnowledgeRepository implements KnowledgeRepository {
  private readonly db: Database;
  private readonly defaultRetentionMode: KnowledgeRetentionMode;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(options: PgKnowledgeRepositoryOptions) {
    this.db = options.db;
    this.defaultRetentionMode = options.defaultRetentionMode ?? "30_days";
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
  }

  async uploadDocument(
    input: UploadKnowledgeDocumentInput,
  ): Promise<KnowledgeDocumentUploadResponse> {
    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const retentionMode = await resolveWorkspaceRetentionMode(
        tx,
        input.workspaceId,
        this.defaultRetentionMode,
      );
      assertStorageAllowed(retentionMode);

      const chunkTexts = chunkDocumentText(input.text);
      if (
        chunkTexts.length === 0 ||
        input.title.trim().length === 0 ||
        input.source.trim().length === 0
      ) {
        throw new KnowledgeRepositoryError("invalid_request");
      }

      const documentId = `doc_${this.idGenerator()}`;
      const timestamp = this.now();
      const permissionTags = normalizePermissionTags(input.permissionTags);
      await tx.insert(documents).values({
        id: documentId,
        workspaceId: input.workspaceId,
        ownerUserId: input.actorUserId,
        title: input.title.trim(),
        source: input.source.trim(),
        status: "active",
        createdBy: input.actorUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const chunkRows = chunkTexts.map((text, index) => ({
        id: `chunk_${this.idGenerator()}`,
        workspaceId: input.workspaceId,
        documentId,
        chunkIndex: index,
        text,
        permissionTags,
        createdBy: input.actorUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      await tx.insert(documentChunks).values(chunkRows);

      return {
        document: {
          document_id: documentId,
          workspace_id: input.workspaceId,
          title: input.title.trim(),
          source: input.source.trim(),
          status: "active",
          chunk_count: chunkRows.length,
          created_by: input.actorUserId,
          created_at: timestamp.toISOString(),
          updated_at: timestamp.toISOString(),
        },
        chunks: chunkRows.map((row) => ({
          chunk_id: row.id,
          document_id: documentId,
          chunk_index: row.chunkIndex,
          text: row.text,
          permission_tags: row.permissionTags,
        })),
      };
    });
  }

  async listDocuments(workspaceId: string): Promise<KnowledgeDocumentListResponse> {
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.workspaceId, workspaceId), eq(documents.status, "active")))
        .orderBy(desc(documents.createdAt), desc(documents.id));

      const summaries = await Promise.all(
        rows.map(async (row) => toDocumentSummary(row, await countChunks(tx, workspaceId, row.id))),
      );

      return { workspace_id: workspaceId, documents: summaries };
    });
  }

  async getDocumentDetail(
    workspaceId: string,
    documentId: string,
  ): Promise<KnowledgeDocumentDetailResponse | undefined> {
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.id, documentId),
            eq(documents.status, "active"),
          ),
        );
      const row = rows[0];
      if (row === undefined) {
        return undefined;
      }

      const chunks = await tx
        .select()
        .from(documentChunks)
        .where(
          and(
            eq(documentChunks.workspaceId, workspaceId),
            eq(documentChunks.documentId, documentId),
          ),
        )
        .orderBy(documentChunks.chunkIndex);

      return {
        document: toDocumentSummary(row, chunks.length),
        chunks: chunks.map(toDocumentChunk),
      };
    });
  }

  async search(input: SearchKnowledgeInput): Promise<KnowledgeSearchResponse> {
    const terms = tokenizeQuery(input.query);
    if (terms.length === 0) {
      throw new KnowledgeRepositoryError("invalid_request");
    }

    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const predicates = terms.map((term) => ilike(documentChunks.text, `%${term}%`));
      const textPredicate = or(...predicates);
      const rows = await tx
        .select({
          documentId: documents.id,
          title: documents.title,
          source: documents.source,
          chunkId: documentChunks.id,
          chunkIndex: documentChunks.chunkIndex,
          text: documentChunks.text,
        })
        .from(documentChunks)
        .innerJoin(
          documents,
          and(
            eq(documents.id, documentChunks.documentId),
            eq(documents.workspaceId, documentChunks.workspaceId),
          ),
        )
        .where(
          and(
            eq(documentChunks.workspaceId, input.workspaceId),
            eq(documents.workspaceId, input.workspaceId),
            eq(documents.status, "active"),
            textPredicate,
          ),
        );

      const allowedDocumentIds =
        input.allowedDocumentIds === undefined ? undefined : new Set(input.allowedDocumentIds);
      const results = rows
        .filter((row) => allowedDocumentIds === undefined || allowedDocumentIds.has(row.documentId))
        .map((row) => ({
          document_id: row.documentId,
          title: row.title,
          source: row.source,
          chunk_id: row.chunkId,
          chunk_index: row.chunkIndex,
          text: row.text,
          score: scoreChunk(row.text, terms),
        }))
        .filter((result) => result.score > 0)
        .sort(compareSearchResults)
        .slice(0, clampTopK(input.topK));

      return { workspace_id: input.workspaceId, query: input.query.trim(), results };
    });
  }
}

export interface KnowledgePersistence {
  repository: KnowledgeRepository;
  close(): Promise<void>;
}

export function createKnowledgePersistenceFromConfig(config: DokezaConfig): KnowledgePersistence {
  if (config.database.realtimePersistence === "memory") {
    return {
      repository: new InMemoryKnowledgeRepository(),
      close: async () => undefined,
    };
  }

  if (config.database.url === undefined) {
    throw new Error("DATABASE_URL is required for PostgreSQL knowledge persistence.");
  }

  const pool = createPool(config.database.url, { max: config.database.poolMax });
  const db = createDatabase(pool);

  return {
    repository: new PgKnowledgeRepository({
      db,
      defaultRetentionMode: config.retentionDefaults.individual,
    }),
    close: async () => {
      await closePool(pool);
    },
  };
}

function key(workspaceId: string, documentId: string): string {
  return `${workspaceId}\0${documentId}`;
}

function splitLongParagraph(paragraph: string, maxChunkChars: number): string[] {
  const words = paragraph.split(" ");
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= maxChunkChars) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
    }
    current = word;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function normalizePermissionTags(tags: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (tags ?? [])
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .sort(),
    ),
  ];
}

function tokenizeQuery(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 1),
    ),
  ];
}

function scoreChunk(text: string, terms: readonly string[]): number {
  const lower = text.toLowerCase();
  return terms.reduce((score, term) => {
    const matches = lower.match(new RegExp(escapeRegExp(term), "g"));
    return score + (matches?.length ?? 0);
  }, 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampTopK(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 5;
  }
  return Math.max(1, Math.min(20, Math.trunc(value)));
}

function compareDocuments(left: KnowledgeDocumentSummary, right: KnowledgeDocumentSummary): number {
  return (
    (right.created_at ?? "").localeCompare(left.created_at ?? "") ||
    right.document_id.localeCompare(left.document_id)
  );
}

function compareChunks(left: KnowledgeDocumentChunk, right: KnowledgeDocumentChunk): number {
  return left.chunk_index - right.chunk_index || left.chunk_id.localeCompare(right.chunk_id);
}

function compareSearchResults(
  left: KnowledgeSearchResponse["results"][number],
  right: KnowledgeSearchResponse["results"][number],
): number {
  return (
    right.score - left.score ||
    left.title.localeCompare(right.title) ||
    left.chunk_index - right.chunk_index
  );
}

function assertStorageAllowed(retentionMode: KnowledgeRetentionMode): void {
  if (retentionMode === "live_only" || retentionMode === "local_only") {
    throw new KnowledgeRepositoryError("knowledge_storage_blocked");
  }
}

function readRetentionMode(value: string | undefined): KnowledgeRetentionMode | undefined {
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
  defaultRetentionMode: KnowledgeRetentionMode,
): Promise<KnowledgeRetentionMode> {
  const rows = await tx
    .select({ retentionMode: workspacePolicies.retentionMode })
    .from(workspacePolicies)
    .where(eq(workspacePolicies.workspaceId, workspaceId))
    .orderBy(desc(workspacePolicies.updatedAt))
    .limit(1);

  return readRetentionMode(rows[0]?.retentionMode) ?? defaultRetentionMode;
}

async function countChunks(tx: Database, workspaceId: string, documentId: string): Promise<number> {
  const rows = await tx
    .select({ value: count() })
    .from(documentChunks)
    .where(
      and(eq(documentChunks.workspaceId, workspaceId), eq(documentChunks.documentId, documentId)),
    );
  return rows[0]?.value ?? 0;
}

function toDocumentSummary(
  row: typeof documents.$inferSelect,
  chunkCount: number,
): KnowledgeDocumentSummary {
  const summary: KnowledgeDocumentSummary = {
    document_id: row.id,
    workspace_id: row.workspaceId,
    title: row.title,
    source: row.source,
    status: row.status as KnowledgeDocumentSummary["status"],
    chunk_count: chunkCount,
  };

  if (row.createdBy !== null) {
    summary.created_by = row.createdBy;
  }
  if (row.createdAt !== null) {
    summary.created_at = row.createdAt.toISOString();
  }
  if (row.updatedAt !== null) {
    summary.updated_at = row.updatedAt.toISOString();
  }

  return summary;
}

function toDocumentChunk(row: typeof documentChunks.$inferSelect): KnowledgeDocumentChunk {
  return {
    chunk_id: row.id,
    document_id: row.documentId,
    chunk_index: row.chunkIndex,
    text: row.text,
    permission_tags: row.permissionTags,
  };
}
