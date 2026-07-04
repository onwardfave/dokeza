import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const IsoTimestamp = Type.String({
  description: "ISO 8601 timestamp",
});

const KnowledgeDocumentStatus = Type.Union([
  Type.Literal("active"),
  Type.Literal("disabled"),
  Type.Literal("deleted"),
]);

export const KnowledgeDocumentSummarySchema = Type.Object({
  document_id: Type.String({ minLength: 1 }),
  workspace_id: Type.String({ minLength: 1 }),
  title: Type.String({ minLength: 1 }),
  source: Type.String({ minLength: 1 }),
  status: KnowledgeDocumentStatus,
  chunk_count: Type.Number({ minimum: 0 }),
  created_by: Type.Optional(Type.String({ minLength: 1 })),
  created_at: Type.Optional(IsoTimestamp),
  updated_at: Type.Optional(IsoTimestamp),
});

export const KnowledgeDocumentChunkSchema = Type.Object({
  chunk_id: Type.String({ minLength: 1 }),
  document_id: Type.String({ minLength: 1 }),
  chunk_index: Type.Number({ minimum: 0 }),
  text: Type.String(),
  permission_tags: Type.Array(Type.String()),
});

export const KnowledgeDocumentUploadRequestSchema = Type.Object({
  title: Type.String({ minLength: 1 }),
  source: Type.String({ minLength: 1 }),
  text: Type.String({ minLength: 1 }),
  permission_tags: Type.Optional(Type.Array(Type.String())),
});

export const KnowledgeDocumentListResponseSchema = Type.Object({
  workspace_id: Type.String({ minLength: 1 }),
  documents: Type.Array(KnowledgeDocumentSummarySchema),
});

export const KnowledgeDocumentDetailResponseSchema = Type.Object({
  document: KnowledgeDocumentSummarySchema,
  chunks: Type.Array(KnowledgeDocumentChunkSchema),
});

export const KnowledgeDocumentUploadResponseSchema = Type.Object({
  document: KnowledgeDocumentSummarySchema,
  chunks: Type.Array(KnowledgeDocumentChunkSchema),
});

export const KnowledgeSearchResultSchema = Type.Object({
  document_id: Type.String({ minLength: 1 }),
  title: Type.String({ minLength: 1 }),
  source: Type.String({ minLength: 1 }),
  chunk_id: Type.String({ minLength: 1 }),
  chunk_index: Type.Number({ minimum: 0 }),
  text: Type.String(),
  score: Type.Number({ minimum: 0 }),
});

export const KnowledgeSearchResponseSchema = Type.Object({
  workspace_id: Type.String({ minLength: 1 }),
  query: Type.String({ minLength: 1 }),
  results: Type.Array(KnowledgeSearchResultSchema),
});

export const KnowledgeApiErrorResponseSchema = Type.Object({
  error: Type.Union([
    Type.Literal("auth_required"),
    Type.Literal("auth_invalid"),
    Type.Literal("workspace_access_denied"),
    Type.Literal("document_not_found"),
    Type.Literal("knowledge_storage_blocked"),
    Type.Literal("method_not_allowed"),
    Type.Literal("invalid_request"),
    Type.Literal("service_unavailable"),
  ]),
});

export type KnowledgeDocumentSummary = Static<typeof KnowledgeDocumentSummarySchema>;
export type KnowledgeDocumentChunk = Static<typeof KnowledgeDocumentChunkSchema>;
export type KnowledgeDocumentUploadRequest = Static<typeof KnowledgeDocumentUploadRequestSchema>;
export type KnowledgeDocumentListResponse = Static<typeof KnowledgeDocumentListResponseSchema>;
export type KnowledgeDocumentDetailResponse = Static<typeof KnowledgeDocumentDetailResponseSchema>;
export type KnowledgeDocumentUploadResponse = Static<typeof KnowledgeDocumentUploadResponseSchema>;
export type KnowledgeSearchResult = Static<typeof KnowledgeSearchResultSchema>;
export type KnowledgeSearchResponse = Static<typeof KnowledgeSearchResponseSchema>;
export type KnowledgeApiErrorResponse = Static<typeof KnowledgeApiErrorResponseSchema>;

export const knowledgeJsonSchemas = {
  "knowledge-document-summary": KnowledgeDocumentSummarySchema,
  "knowledge-document-chunk": KnowledgeDocumentChunkSchema,
  "knowledge-document-upload-request": KnowledgeDocumentUploadRequestSchema,
  "knowledge-document-list-response": KnowledgeDocumentListResponseSchema,
  "knowledge-document-detail-response": KnowledgeDocumentDetailResponseSchema,
  "knowledge-document-upload-response": KnowledgeDocumentUploadResponseSchema,
  "knowledge-search-result": KnowledgeSearchResultSchema,
  "knowledge-search-response": KnowledgeSearchResponseSchema,
  "knowledge-api-error-response": KnowledgeApiErrorResponseSchema,
} satisfies Record<string, TSchema>;

export function validateKnowledgeDocumentUploadRequest(
  value: unknown,
): value is KnowledgeDocumentUploadRequest {
  return Value.Check(KnowledgeDocumentUploadRequestSchema, value);
}

export function validateKnowledgeDocumentListResponse(
  value: unknown,
): value is KnowledgeDocumentListResponse {
  return Value.Check(KnowledgeDocumentListResponseSchema, value);
}

export function validateKnowledgeDocumentDetailResponse(
  value: unknown,
): value is KnowledgeDocumentDetailResponse {
  return Value.Check(KnowledgeDocumentDetailResponseSchema, value);
}

export function validateKnowledgeDocumentUploadResponse(
  value: unknown,
): value is KnowledgeDocumentUploadResponse {
  return Value.Check(KnowledgeDocumentUploadResponseSchema, value);
}

export function validateKnowledgeSearchResponse(value: unknown): value is KnowledgeSearchResponse {
  return Value.Check(KnowledgeSearchResponseSchema, value);
}
