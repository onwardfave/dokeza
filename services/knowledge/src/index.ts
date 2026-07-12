import { createHash, randomUUID } from "node:crypto";
import { authorizeWorkspace, type Actor, type WorkspaceRole } from "@dokeza/authz";
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
  auditLogs,
  documentChunks,
  documents,
  withWorkspaceTransaction,
  workspacePolicies,
  type Database,
} from "@dokeza/db";
import type { DokezaConfig } from "@dokeza/config";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

/**
 * Sink for metadata-only knowledge telemetry. Injected so callers with a
 * telemetry pipeline can observe events (for example embedding-provider
 * failures) without the knowledge package taking a hard dependency on any
 * exporter. Events are content-free by construction.
 */
export type KnowledgeTelemetrySink = (event: TelemetryEvent) => void;

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
  actorRole: WorkspaceRole;
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
  access?: KnowledgeAccessContext;
}

export interface KnowledgeAccessContext {
  actorUserId: string;
  actorRole: WorkspaceRole;
  permissionTags?: readonly string[];
}

export interface KnowledgeRepository {
  uploadDocument(input: UploadKnowledgeDocumentInput): Promise<KnowledgeDocumentUploadResponse>;
  listDocuments(
    workspaceId: string,
    access?: KnowledgeAccessContext,
  ): Promise<KnowledgeDocumentListResponse>;
  getDocumentDetail(
    workspaceId: string,
    documentId: string,
    access?: KnowledgeAccessContext,
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

export type KnowledgeEmbeddingRoute = "document_chunk" | "search_query";

export interface KnowledgeEmbeddingInput {
  workspaceId: string;
  route: KnowledgeEmbeddingRoute;
  text: string;
  documentId?: string;
  chunkId?: string;
}

export interface KnowledgeEmbeddingResult {
  vector: number[];
  provider: "deterministic" | "openai";
  model: string;
  dimensions: number;
}

export interface KnowledgeEmbeddingProvider {
  readonly provider: "deterministic" | "openai";
  readonly model: string;
  readonly dimensions: number;
  embed(input: KnowledgeEmbeddingInput): Promise<KnowledgeEmbeddingResult>;
}

export class KnowledgeEmbeddingError extends Error {
  readonly code:
    | "embedding_provider_timeout"
    | "embedding_provider_unavailable"
    | "invalid_embedding_response";

  constructor(code: KnowledgeEmbeddingError["code"]) {
    super(code);
    this.code = code;
  }
}

export interface OpenAiEmbeddingTransportResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type OpenAiEmbeddingTransport = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<OpenAiEmbeddingTransportResponse>;

export class DeterministicKnowledgeEmbeddingProvider implements KnowledgeEmbeddingProvider {
  readonly provider = "deterministic" as const;
  readonly model = "deterministic-hash-v1";
  readonly dimensions: number;

  constructor(dimensions = 1536) {
    this.dimensions = dimensions;
  }

  async embed(input: KnowledgeEmbeddingInput): Promise<KnowledgeEmbeddingResult> {
    return {
      vector: createDeterministicVector(input.text, this.dimensions),
      provider: this.provider,
      model: this.model,
      dimensions: this.dimensions,
    };
  }
}

export interface OpenAiKnowledgeEmbeddingProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  dimensions: number;
  /** Send the `dimensions` request parameter. Default true (OpenAI). */
  sendDimensions?: boolean;
  /** Send an `input_type` parameter derived from the route. Default false. */
  sendInputType?: boolean;
  transport?: OpenAiEmbeddingTransport;
}

export class OpenAiKnowledgeEmbeddingProvider implements KnowledgeEmbeddingProvider {
  readonly provider = "openai" as const;
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly sendDimensions: boolean;
  private readonly sendInputType: boolean;
  private readonly transport: OpenAiEmbeddingTransport;

  constructor(options: OpenAiKnowledgeEmbeddingProviderOptions) {
    this.apiKey = options.apiKey;
    this.endpoint = `${options.baseUrl.replace(/\/+$/, "")}/embeddings`;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.dimensions = options.dimensions;
    this.sendDimensions = options.sendDimensions ?? true;
    this.sendInputType = options.sendInputType ?? false;
    this.transport = options.transport ?? defaultOpenAiEmbeddingTransport;
  }

  async embed(input: KnowledgeEmbeddingInput): Promise<KnowledgeEmbeddingResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const requestBody: Record<string, unknown> = {
        model: this.model,
        input: input.text,
      };
      if (this.sendDimensions) {
        requestBody.dimensions = this.dimensions;
      }
      if (this.sendInputType) {
        // Asymmetric retrieval models distinguish the document and query sides.
        requestBody.input_type = input.route === "search_query" ? "query" : "passage";
      }

      const response = await this.transport(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new KnowledgeEmbeddingError("embedding_provider_unavailable");
      }

      const vector = readOpenAiEmbeddingVector(await response.json(), this.dimensions);
      return {
        vector,
        provider: this.provider,
        model: this.model,
        dimensions: this.dimensions,
      };
    } catch (err) {
      if (err instanceof KnowledgeEmbeddingError) {
        throw err;
      }
      if (isAbortError(err)) {
        throw new KnowledgeEmbeddingError("embedding_provider_timeout");
      }
      throw new KnowledgeEmbeddingError("embedding_provider_unavailable");
    } finally {
      clearTimeout(timeout);
    }
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
    actorRole: authorization.role ?? "member",
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
  embeddingProvider?: KnowledgeEmbeddingProvider;
  telemetrySink?: KnowledgeTelemetrySink;
  now?: () => Date;
  idGenerator?: () => string;
}

interface StoredKnowledgeDocument {
  document: KnowledgeDocumentSummary;
  chunks: KnowledgeDocumentChunk[];
  embeddingsByChunkId: Map<string, number[]>;
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly documentsByKey = new Map<string, StoredKnowledgeDocument>();
  private readonly retentionMode: KnowledgeRetentionMode;
  private readonly embeddingProvider: KnowledgeEmbeddingProvider | undefined;
  private readonly telemetrySink: KnowledgeTelemetrySink | undefined;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(options: InMemoryKnowledgeRepositoryOptions = {}) {
    this.retentionMode = options.retentionMode ?? "30_days";
    this.embeddingProvider = options.embeddingProvider;
    this.telemetrySink = options.telemetrySink;
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
      embeddingsByChunkId: new Map(),
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
    const embeddingsByChunkId = await createChunkEmbeddings({
      embeddingProvider: this.embeddingProvider,
      telemetrySink: this.telemetrySink,
      workspaceId: input.workspaceId,
      documentId,
      chunks: storedChunks.map((chunk) => ({ id: chunk.chunk_id, text: chunk.text })),
    });

    const detail = { document, chunks: storedChunks };
    this.documentsByKey.set(key(document.workspace_id, document.document_id), {
      document,
      chunks: storedChunks,
      embeddingsByChunkId,
    });
    return detail;
  }

  async listDocuments(
    workspaceId: string,
    access?: KnowledgeAccessContext,
  ): Promise<KnowledgeDocumentListResponse> {
    const documentsForWorkspace = [...this.documentsByKey.values()]
      .filter(
        (stored) =>
          stored.document.workspace_id === workspaceId && stored.document.status !== "deleted",
      )
      .filter((stored) =>
        stored.chunks.some((chunk) =>
          canAccessKnowledgeChunk(stored.document.created_by, chunk.permission_tags, access),
        ),
      )
      .map((stored) => ({
        ...stored.document,
        chunk_count: stored.chunks.filter((chunk) =>
          canAccessKnowledgeChunk(stored.document.created_by, chunk.permission_tags, access),
        ).length,
      }))
      .sort(compareDocuments);

    return { workspace_id: workspaceId, documents: documentsForWorkspace };
  }

  async getDocumentDetail(
    workspaceId: string,
    documentId: string,
    access?: KnowledgeAccessContext,
  ): Promise<KnowledgeDocumentDetailResponse | undefined> {
    const stored = this.documentsByKey.get(key(workspaceId, documentId));
    if (stored === undefined || stored.document.status === "deleted") {
      return undefined;
    }

    const chunks = stored.chunks
      .filter((chunk) =>
        canAccessKnowledgeChunk(stored.document.created_by, chunk.permission_tags, access),
      )
      .sort(compareChunks);
    if (chunks.length === 0) {
      return undefined;
    }

    return { document: { ...stored.document, chunk_count: chunks.length }, chunks };
  }

  async search(input: SearchKnowledgeInput): Promise<KnowledgeSearchResponse> {
    const terms = tokenizeQuery(input.query);
    if (terms.length === 0) {
      throw new KnowledgeRepositoryError("invalid_request");
    }

    const queryVector = await createSearchEmbedding({
      embeddingProvider: this.embeddingProvider,
      telemetrySink: this.telemetrySink,
      workspaceId: input.workspaceId,
      query: input.query,
    });
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
        stored.chunks
          .filter((chunk) =>
            canAccessKnowledgeChunk(
              stored.document.created_by,
              chunk.permission_tags,
              input.access,
            ),
          )
          .map((chunk) => ({
            document_id: stored.document.document_id,
            title: stored.document.title,
            source: stored.document.source,
            chunk_id: chunk.chunk_id,
            chunk_index: chunk.chunk_index,
            text: chunk.text,
            score:
              scoreChunk(chunk.text, terms) +
              scoreVector(stored.embeddingsByChunkId.get(chunk.chunk_id), queryVector),
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
  embeddingProvider?: KnowledgeEmbeddingProvider;
  telemetrySink?: KnowledgeTelemetrySink;
  now?: () => Date;
  idGenerator?: () => string;
}

export class PgKnowledgeRepository implements KnowledgeRepository {
  private readonly db: Database;
  private readonly defaultRetentionMode: KnowledgeRetentionMode;
  private readonly embeddingProvider: KnowledgeEmbeddingProvider | undefined;
  private readonly telemetrySink: KnowledgeTelemetrySink | undefined;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  constructor(options: PgKnowledgeRepositoryOptions) {
    this.db = options.db;
    this.defaultRetentionMode = options.defaultRetentionMode ?? "30_days";
    this.embeddingProvider = options.embeddingProvider;
    this.telemetrySink = options.telemetrySink;
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
      const embeddingsByChunkId = await createChunkEmbeddings({
        embeddingProvider: this.embeddingProvider,
        telemetrySink: this.telemetrySink,
        workspaceId: input.workspaceId,
        documentId,
        chunks: chunkRows.map((chunk) => ({ id: chunk.id, text: chunk.text })),
      });
      await tx.insert(documentChunks).values(
        chunkRows.map((row) => ({
          ...row,
          embedding: embeddingsByChunkId.get(row.id) ?? null,
        })),
      );
      await tx.insert(auditLogs).values({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        action: "document.uploaded",
        targetType: "document",
        targetId: documentId,
      });

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

  async listDocuments(
    workspaceId: string,
    access?: KnowledgeAccessContext,
  ): Promise<KnowledgeDocumentListResponse> {
    return withWorkspaceTransaction(this.db, workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.workspaceId, workspaceId), eq(documents.status, "active")))
        .orderBy(desc(documents.createdAt), desc(documents.id));

      const summaries = (
        await Promise.all(
          rows.map(async (row) => {
            const accessibleCount = await countAccessibleChunks(
              tx,
              workspaceId,
              row.id,
              row.ownerUserId,
              access,
            );
            return accessibleCount === 0 ? undefined : toDocumentSummary(row, accessibleCount);
          }),
        )
      ).filter((summary) => summary !== undefined);

      return { workspace_id: workspaceId, documents: summaries };
    });
  }

  async getDocumentDetail(
    workspaceId: string,
    documentId: string,
    access?: KnowledgeAccessContext,
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

      const accessibleChunks = chunks.filter((chunk) =>
        canAccessKnowledgeChunk(row.ownerUserId ?? undefined, chunk.permissionTags, access),
      );
      if (accessibleChunks.length === 0) {
        return undefined;
      }

      return {
        document: toDocumentSummary(row, accessibleChunks.length),
        chunks: accessibleChunks.map(toDocumentChunk),
      };
    });
  }

  async search(input: SearchKnowledgeInput): Promise<KnowledgeSearchResponse> {
    const terms = tokenizeQuery(input.query);
    if (terms.length === 0) {
      throw new KnowledgeRepositoryError("invalid_request");
    }

    return withWorkspaceTransaction(this.db, input.workspaceId, async (tx) => {
      const queryVector = await createSearchEmbedding({
        embeddingProvider: this.embeddingProvider,
        telemetrySink: this.telemetrySink,
        workspaceId: input.workspaceId,
        query: input.query,
      });
      const predicates = terms.map((term) => ilike(documentChunks.text, `%${term}%`));
      const textPredicate = or(...predicates);
      const keywordRows = await tx
        .select({
          documentId: documents.id,
          title: documents.title,
          source: documents.source,
          chunkId: documentChunks.id,
          chunkIndex: documentChunks.chunkIndex,
          text: documentChunks.text,
          permissionTags: documentChunks.permissionTags,
          ownerUserId: documents.ownerUserId,
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
            createAllowedDocumentPredicate(input.allowedDocumentIds),
            createKnowledgeAccessPredicate(input.access),
          ),
        );

      const vectorRows =
        queryVector === undefined
          ? []
          : await tx
              .select({
                documentId: documents.id,
                title: documents.title,
                source: documents.source,
                chunkId: documentChunks.id,
                chunkIndex: documentChunks.chunkIndex,
                text: documentChunks.text,
                permissionTags: documentChunks.permissionTags,
                ownerUserId: documents.ownerUserId,
                distance: sql<number>`${documentChunks.embedding} <=> ${toPgVectorLiteral(queryVector)}::vector`,
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
                  sql`${documentChunks.embedding} is not null`,
                  createAllowedDocumentPredicate(input.allowedDocumentIds),
                  createKnowledgeAccessPredicate(input.access),
                ),
              )
              .orderBy(
                sql`${documentChunks.embedding} <=> ${toPgVectorLiteral(queryVector)}::vector`,
              )
              .limit(clampTopK(input.topK) * 3);

      const mergedResults = new Map<string, KnowledgeSearchResponse["results"][number]>();
      for (const row of keywordRows) {
        if (
          !canAccessKnowledgeChunk(row.ownerUserId ?? undefined, row.permissionTags, input.access)
        ) {
          continue;
        }
        mergedResults.set(row.chunkId, {
          document_id: row.documentId,
          title: row.title,
          source: row.source,
          chunk_id: row.chunkId,
          chunk_index: row.chunkIndex,
          text: row.text,
          score: scoreChunk(row.text, terms),
        });
      }
      for (const row of vectorRows) {
        if (
          !canAccessKnowledgeChunk(row.ownerUserId ?? undefined, row.permissionTags, input.access)
        ) {
          continue;
        }
        const current = mergedResults.get(row.chunkId);
        const vectorScore = scoreVectorDistance(row.distance);
        if (current === undefined) {
          mergedResults.set(row.chunkId, {
            document_id: row.documentId,
            title: row.title,
            source: row.source,
            chunk_id: row.chunkId,
            chunk_index: row.chunkIndex,
            text: row.text,
            score: vectorScore,
          });
          continue;
        }
        current.score += vectorScore;
      }

      const results = [...mergedResults.values()]
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

export function createKnowledgeEmbeddingProviderFromConfig(
  config: DokezaConfig,
): KnowledgeEmbeddingProvider {
  if (config.providers.embeddings.provider === "deterministic") {
    return new DeterministicKnowledgeEmbeddingProvider(
      config.providers.embeddings.openai.dimensions,
    );
  }

  const apiKey = config.providers.embeddings.openai.apiKey;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("OPENAI_API_KEY is required for OpenAI embedding provider.");
  }

  return new OpenAiKnowledgeEmbeddingProvider({
    apiKey,
    baseUrl: config.providers.embeddings.openai.baseUrl,
    model: config.providers.embeddings.openai.model,
    timeoutMs: config.providers.embeddings.openai.timeoutMs,
    dimensions: config.providers.embeddings.openai.dimensions,
    sendDimensions: config.providers.embeddings.openai.sendDimensions,
    sendInputType: config.providers.embeddings.openai.sendInputType,
  });
}

export function createKnowledgePersistenceFromConfig(
  config: DokezaConfig,
  options: { telemetrySink?: KnowledgeTelemetrySink } = {},
): KnowledgePersistence {
  const embeddingProvider = createKnowledgeEmbeddingProviderFromConfig(config);
  const telemetryOption =
    options.telemetrySink === undefined ? {} : { telemetrySink: options.telemetrySink };

  if (config.database.realtimePersistence === "memory") {
    return {
      repository: new InMemoryKnowledgeRepository({ embeddingProvider, ...telemetryOption }),
      close: async () => undefined,
    };
  }

  if (config.database.url === undefined) {
    throw new Error("DATABASE_URL is required for PostgreSQL knowledge persistence.");
  }

  const pool = createPool(config.database.url, {
    max: config.database.poolMax,
    ...(config.database.role === undefined ? {} : { role: config.database.role }),
  });
  const db = createDatabase(pool);

  return {
    repository: new PgKnowledgeRepository({
      db,
      defaultRetentionMode: config.retentionDefaults.individual,
      embeddingProvider,
      ...telemetryOption,
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
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
        .sort(),
    ),
  ];
}

function canAccessKnowledgeChunk(
  documentOwnerUserId: string | undefined,
  permissionTags: readonly string[],
  access: KnowledgeAccessContext | undefined,
): boolean {
  const normalizedTags = normalizePermissionTags(permissionTags);
  if (normalizedTags.length === 0) {
    return true;
  }
  if (access === undefined) {
    return false;
  }
  if (access.actorRole === "owner" || access.actorRole === "admin") {
    return true;
  }
  if (documentOwnerUserId === access.actorUserId) {
    return true;
  }

  const effectiveTags = new Set(
    normalizePermissionTags([
      `user:${access.actorUserId}`,
      `role:${access.actorRole}`,
      ...(access.permissionTags ?? []),
    ]),
  );
  return normalizedTags.some((tag) => effectiveTags.has(tag));
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

function createDeterministicVector(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const terms = tokenizeQuery(text);
  for (const term of terms.length > 0 ? terms : [text.trim().toLowerCase()]) {
    if (term.length === 0) {
      continue;
    }
    const hash = createHash("sha256").update(term).digest();
    const index = hash.readUInt32BE(0) % dimensions;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  return normalizeVector(vector);
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

async function createChunkEmbeddings(input: {
  embeddingProvider: KnowledgeEmbeddingProvider | undefined;
  telemetrySink: KnowledgeTelemetrySink | undefined;
  workspaceId: string;
  documentId: string;
  chunks: readonly { id: string; text: string }[];
}): Promise<Map<string, number[]>> {
  const embeddingProvider = input.embeddingProvider;
  if (embeddingProvider === undefined) {
    return new Map();
  }

  try {
    const embeddings = await Promise.all(
      input.chunks.map(async (chunk) => ({
        chunkId: chunk.id,
        result: await embeddingProvider.embed({
          workspaceId: input.workspaceId,
          documentId: input.documentId,
          chunkId: chunk.id,
          route: "document_chunk",
          text: chunk.text,
        }),
      })),
    );
    return new Map(embeddings.map((embedding) => [embedding.chunkId, embedding.result.vector]));
  } catch (err) {
    // Graceful degradation: chunks are stored without embeddings and retrieval
    // falls back to keyword-only. Emit a metadata-only signal so the silent
    // degradation is observable instead of invisible.
    emitEmbeddingFailure(input.telemetrySink, {
      workspaceId: input.workspaceId,
      route: "document_chunk",
      provider: embeddingProvider.provider,
      model: embeddingProvider.model,
      error: err,
    });
    return new Map();
  }
}

async function createSearchEmbedding(input: {
  embeddingProvider: KnowledgeEmbeddingProvider | undefined;
  telemetrySink: KnowledgeTelemetrySink | undefined;
  workspaceId: string;
  query: string;
}): Promise<number[] | undefined> {
  const embeddingProvider = input.embeddingProvider;
  if (embeddingProvider === undefined) {
    return undefined;
  }

  try {
    const result = await embeddingProvider.embed({
      workspaceId: input.workspaceId,
      route: "search_query",
      text: input.query,
    });
    return result.vector;
  } catch (err) {
    // Graceful degradation to keyword-only search; surface a metadata-only
    // signal so a query running without semantic retrieval is observable.
    emitEmbeddingFailure(input.telemetrySink, {
      workspaceId: input.workspaceId,
      route: "search_query",
      provider: embeddingProvider.provider,
      model: embeddingProvider.model,
      error: err,
    });
    return undefined;
  }
}

function emitEmbeddingFailure(
  sink: KnowledgeTelemetrySink | undefined,
  info: {
    workspaceId: string;
    route: KnowledgeEmbeddingRoute;
    provider: string;
    model: string;
    error: unknown;
  },
): void {
  if (sink === undefined) {
    return;
  }

  const errorCategory =
    info.error instanceof KnowledgeEmbeddingError ? info.error.code : "unknown_error";

  try {
    sink(
      createTelemetryEvent("knowledge.embedding_provider_failed", {
        workspaceId: info.workspaceId,
        route: info.route,
        provider: info.provider,
        model: info.model,
        errorCategory,
        degradedTo: "keyword_only",
      }),
    );
  } catch {
    // Telemetry must never affect retrieval behavior.
  }
}

function scoreVector(chunkVector: number[] | undefined, queryVector: number[] | undefined): number {
  if (chunkVector === undefined || queryVector === undefined) {
    return 0;
  }

  const length = Math.min(chunkVector.length, queryVector.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += (chunkVector[index] ?? 0) * (queryVector[index] ?? 0);
  }

  return Math.max(0, score);
}

function scoreVectorDistance(distance: number): number {
  if (!Number.isFinite(distance)) {
    return 0;
  }

  return Math.max(0, 1 - distance);
}

function toPgVectorLiteral(vector: readonly number[]): string {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

function createAllowedDocumentPredicate(allowedDocumentIds: readonly string[] | undefined) {
  if (allowedDocumentIds === undefined) {
    return undefined;
  }
  if (allowedDocumentIds.length === 0) {
    return sql`false`;
  }
  return inArray(documents.id, [...allowedDocumentIds]);
}

function createKnowledgeAccessPredicate(access: KnowledgeAccessContext | undefined) {
  const untagged = sql`cardinality(${documentChunks.permissionTags}) = 0`;
  if (access === undefined) {
    return untagged;
  }
  if (access.actorRole === "owner" || access.actorRole === "admin") {
    return undefined;
  }

  const effectiveTags = normalizePermissionTags([
    `user:${access.actorUserId}`,
    `role:${access.actorRole}`,
    ...(access.permissionTags ?? []),
  ]);
  const effectiveTagArray = sql`array[${sql.join(
    effectiveTags.map((tag) => sql`${tag}`),
    sql`, `,
  )}]::text[]`;
  return or(
    untagged,
    eq(documents.ownerUserId, access.actorUserId),
    sql`${documentChunks.permissionTags} && ${effectiveTagArray}`,
  );
}

async function defaultOpenAiEmbeddingTransport(
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
): Promise<OpenAiEmbeddingTransportResponse> {
  return fetch(url, init);
}

function readOpenAiEmbeddingVector(payload: unknown, dimensions: number): number[] {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    !Array.isArray(payload.data)
  ) {
    throw new KnowledgeEmbeddingError("invalid_embedding_response");
  }

  const first = payload.data[0] as unknown;
  if (
    typeof first !== "object" ||
    first === null ||
    !("embedding" in first) ||
    !Array.isArray(first.embedding)
  ) {
    throw new KnowledgeEmbeddingError("invalid_embedding_response");
  }

  const vector = first.embedding;
  if (vector.length !== dimensions || !vector.every((value) => typeof value === "number")) {
    throw new KnowledgeEmbeddingError("invalid_embedding_response");
  }

  return vector;
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  );
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

async function countAccessibleChunks(
  tx: Database,
  workspaceId: string,
  documentId: string,
  documentOwnerUserId: string | null,
  access: KnowledgeAccessContext | undefined,
): Promise<number> {
  const rows = await tx
    .select({ permissionTags: documentChunks.permissionTags })
    .from(documentChunks)
    .where(
      and(eq(documentChunks.workspaceId, workspaceId), eq(documentChunks.documentId, documentId)),
    );
  return rows.filter((row) =>
    canAccessKnowledgeChunk(documentOwnerUserId ?? undefined, row.permissionTags, access),
  ).length;
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
