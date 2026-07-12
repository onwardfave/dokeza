import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const IsoTimestamp = Type.String({
  description: "ISO 8601 timestamp",
});

const MeetingStatus = Type.Union([
  Type.Literal("active"),
  Type.Literal("paused"),
  Type.Literal("ended"),
]);

const Speaker = Type.Union([Type.Literal("user"), Type.Literal("remote"), Type.Literal("unknown")]);

const AudioStream = Type.Union([Type.Literal("microphone"), Type.Literal("system")]);

const AudioGapReason = Type.Union([
  Type.Literal("local_buffer_full"),
  Type.Literal("policy_buffer_disabled"),
  Type.Literal("user_paused_capture"),
  Type.Literal("device_unavailable"),
]);

const SuggestionKind = Type.Union([
  Type.Literal("answer_question"),
  Type.Literal("summarize_so_far"),
  Type.Literal("suggest_follow_up"),
  Type.Literal("objection_response"),
]);

const Confidence = Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")]);

export const MeetingSummarySchema = Type.Object({
  meeting_id: Type.String({ minLength: 1 }),
  workspace_id: Type.String({ minLength: 1 }),
  created_by: Type.String({ minLength: 1 }),
  meeting_source: Type.String({ minLength: 1 }),
  status: MeetingStatus,
  started_at: Type.Optional(IsoTimestamp),
  ended_at: Type.Optional(IsoTimestamp),
  segment_count: Type.Number({ minimum: 0 }),
  gap_count: Type.Number({ minimum: 0 }),
});

export const MeetingTranscriptSegmentSchema = Type.Object({
  segment_id: Type.String({ minLength: 1 }),
  speaker: Speaker,
  text: Type.String(),
  start_ms: Type.Number({ minimum: 0 }),
  end_ms: Type.Number({ minimum: 0 }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
});

export const MeetingTranscriptGapSchema = Type.Object({
  stream: AudioStream,
  start_ms: Type.Number({ minimum: 0 }),
  end_ms: Type.Number({ minimum: 0 }),
  dropped_chunks: Type.Number({ minimum: 1 }),
  reason: AudioGapReason,
});

export const MeetingSuggestionSourceSchema = Type.Object({
  document_id: Type.String({ minLength: 1 }),
  title: Type.String(),
  chunk_id: Type.String({ minLength: 1 }),
});

export const MeetingSuggestionSchema = Type.Object({
  suggestion_id: Type.String({ minLength: 1 }),
  request_id: Type.Optional(Type.String({ minLength: 1 })),
  kind: SuggestionKind,
  content: Type.String(),
  sources: Type.Array(MeetingSuggestionSourceSchema),
  confidence: Confidence,
  prompt_version: Type.String({ minLength: 1 }),
  model: Type.String({ minLength: 1 }),
  server_seq: Type.Optional(Type.Number({ minimum: 0 })),
  created_at: Type.Optional(IsoTimestamp),
});

export const MeetingHistoryResponseSchema = Type.Object({
  workspace_id: Type.String({ minLength: 1 }),
  meetings: Type.Array(MeetingSummarySchema),
});

export const MeetingDetailResponseSchema = Type.Object({
  meeting: MeetingSummarySchema,
  transcript: Type.Object({
    segments: Type.Array(MeetingTranscriptSegmentSchema),
    gaps: Type.Array(MeetingTranscriptGapSchema),
  }),
  suggestions: Type.Array(MeetingSuggestionSchema),
});

export const MeetingExportResponseSchema = Type.Object({
  meeting_id: Type.String({ minLength: 1 }),
  workspace_id: Type.String({ minLength: 1 }),
  format: Type.Union([Type.Literal("markdown"), Type.Literal("json")]),
  content_type: Type.Union([Type.Literal("text/markdown"), Type.Literal("application/json")]),
  content: Type.String(),
});

export const MeetingDeleteResponseSchema = Type.Object({
  meeting_id: Type.String({ minLength: 1 }),
  workspace_id: Type.String({ minLength: 1 }),
  deleted: Type.Literal(true),
});

export const MeetingApiErrorResponseSchema = Type.Object({
  error: Type.Union([
    Type.Literal("auth_required"),
    Type.Literal("auth_invalid"),
    Type.Literal("workspace_access_denied"),
    Type.Literal("meeting_not_found"),
    Type.Literal("method_not_allowed"),
    Type.Literal("invalid_request"),
    Type.Literal("service_unavailable"),
    Type.Literal("meeting_delete_forbidden"),
    Type.Literal("origin_not_allowed"),
    Type.Literal("request_body_too_large"),
    Type.Literal("rate_limited"),
  ]),
});

export type MeetingSummary = Static<typeof MeetingSummarySchema>;
export type MeetingTranscriptSegment = Static<typeof MeetingTranscriptSegmentSchema>;
export type MeetingTranscriptGap = Static<typeof MeetingTranscriptGapSchema>;
export type MeetingSuggestionSource = Static<typeof MeetingSuggestionSourceSchema>;
export type MeetingSuggestion = Static<typeof MeetingSuggestionSchema>;
export type MeetingHistoryResponse = Static<typeof MeetingHistoryResponseSchema>;
export type MeetingDetailResponse = Static<typeof MeetingDetailResponseSchema>;
export type MeetingExportResponse = Static<typeof MeetingExportResponseSchema>;
export type MeetingDeleteResponse = Static<typeof MeetingDeleteResponseSchema>;
export type MeetingApiErrorResponse = Static<typeof MeetingApiErrorResponseSchema>;

export const meetingJsonSchemas = {
  "meeting-summary": MeetingSummarySchema,
  "meeting-transcript-segment": MeetingTranscriptSegmentSchema,
  "meeting-transcript-gap": MeetingTranscriptGapSchema,
  "meeting-suggestion-source": MeetingSuggestionSourceSchema,
  "meeting-suggestion": MeetingSuggestionSchema,
  "meeting-history-response": MeetingHistoryResponseSchema,
  "meeting-detail-response": MeetingDetailResponseSchema,
  "meeting-export-response": MeetingExportResponseSchema,
  "meeting-delete-response": MeetingDeleteResponseSchema,
  "meeting-api-error-response": MeetingApiErrorResponseSchema,
} satisfies Record<string, TSchema>;

export function validateMeetingHistoryResponse(value: unknown): value is MeetingHistoryResponse {
  return Value.Check(MeetingHistoryResponseSchema, value);
}

export function validateMeetingDetailResponse(value: unknown): value is MeetingDetailResponse {
  return Value.Check(MeetingDetailResponseSchema, value);
}

export function validateMeetingExportResponse(value: unknown): value is MeetingExportResponse {
  return Value.Check(MeetingExportResponseSchema, value);
}

export function validateMeetingDeleteResponse(value: unknown): value is MeetingDeleteResponse {
  return Value.Check(MeetingDeleteResponseSchema, value);
}
