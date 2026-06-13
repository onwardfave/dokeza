import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const REALTIME_PROTOCOL_VERSION = "2026-06-12" as const;

const IsoTimestamp = Type.String({
  description: "ISO 8601 timestamp",
});

const MessageEnvelopeFields = {
  protocol_version: Type.Literal(REALTIME_PROTOCOL_VERSION),
  seq: Type.Number({ minimum: 0 }),
  session_id: Type.Optional(Type.String({ minLength: 1 })),
  sent_at: IsoTimestamp,
};

const ProcessingLocation = Type.Union([
  Type.Literal("cloud"),
  Type.Literal("local"),
  Type.Literal("hybrid"),
]);

const AudioStream = Type.Union([Type.Literal("microphone"), Type.Literal("system")]);

const AudioFormat = Type.Literal("pcm_s16le");

const ClosedReason = Type.Union([
  Type.Literal("user_stopped"),
  Type.Literal("server_closed"),
  Type.Literal("policy_violation"),
  Type.Literal("unrecoverable_error"),
]);

const ErrorCode = Type.Union([
  Type.Literal("auth_failed"),
  Type.Literal("invalid_message"),
  Type.Literal("missing_binary_payload"),
  Type.Literal("unexpected_binary_payload"),
  Type.Literal("audio_byte_length_mismatch"),
  Type.Literal("audio_chunk_out_of_order"),
  Type.Literal("unsupported_audio_format"),
  Type.Literal("stt_provider_timeout"),
  Type.Literal("session_not_resumable"),
]);

const SessionMode = Type.Union([
  Type.Literal("full"),
  Type.Literal("degraded_network"),
  Type.Literal("offline"),
  Type.Literal("reconnecting"),
  Type.Literal("degraded_provider"),
  Type.Literal("degraded_permission"),
]);

const SuggestionKind = Type.Union([
  Type.Literal("answer_question"),
  Type.Literal("summarize_so_far"),
  Type.Literal("suggest_follow_up"),
  Type.Literal("objection_response"),
]);

const Confidence = Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")]);

const Speaker = Type.Union([Type.Literal("user"), Type.Literal("remote"), Type.Literal("unknown")]);

const RetentionMode = Type.Union([
  Type.Literal("live_only"),
  Type.Literal("local_only"),
  Type.Literal("7_days"),
  Type.Literal("30_days"),
  Type.Literal("1_year"),
  Type.Literal("indefinite"),
]);

export const AuthHelloMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  type: Type.Literal("auth.hello"),
  payload: Type.Object({
    token: Type.String({ minLength: 1 }),
    client_version: Type.String({ minLength: 1 }),
    platform: Type.Union([Type.Literal("windows"), Type.Literal("macos")]),
    device_id: Type.String({ minLength: 1 }),
  }),
});

export const SessionStartMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("session.start"),
  payload: Type.Object({
    workspace_id: Type.String({ minLength: 1 }),
    meeting_source: Type.String({ minLength: 1 }),
    capture: Type.Object({
      microphone: Type.Boolean(),
      system_audio: Type.Boolean(),
      screen_context: Type.Boolean(),
    }),
    processing: Type.Object({
      stt: ProcessingLocation,
      llm: ProcessingLocation,
      retrieval: ProcessingLocation,
    }),
  }),
});

export const AudioChunkMetaMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("audio.chunk_meta"),
  payload: Type.Object({
    chunk_id: Type.String({ minLength: 1 }),
    chunk_index: Type.Number({ minimum: 0 }),
    stream: AudioStream,
    format: AudioFormat,
    sample_rate_hz: Type.Literal(16000),
    channels: Type.Literal(1),
    duration_ms: Type.Number({ minimum: 1 }),
    timestamp_ms: Type.Number({ minimum: 0 }),
    byte_length: Type.Number({ minimum: 1 }),
  }),
});

export const AudioGapMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("audio.gap"),
  payload: Type.Object({
    stream: AudioStream,
    start_ms: Type.Number({ minimum: 0 }),
    end_ms: Type.Number({ minimum: 0 }),
    dropped_chunks: Type.Number({ minimum: 1 }),
    reason: Type.Union([
      Type.Literal("local_buffer_full"),
      Type.Literal("policy_buffer_disabled"),
      Type.Literal("user_paused_capture"),
      Type.Literal("device_unavailable"),
    ]),
  }),
});

export const ContextUpdateMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("context.update"),
  payload: Type.Object({
    source: Type.Union([
      Type.Literal("active_window"),
      Type.Literal("screen_text"),
      Type.Literal("browser_extension"),
    ]),
    title: Type.Optional(Type.String()),
    app: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    captured_at: IsoTimestamp,
  }),
});

export const SuggestionRequestMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("suggestion.request"),
  payload: Type.Object({
    request_id: Type.String({ minLength: 1 }),
    kind: SuggestionKind,
    user_prompt: Type.Optional(Type.String()),
    include_sources: Type.Boolean(),
  }),
});

export const SessionEndMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("session.end"),
  payload: Type.Object({
    reason: Type.Union([
      Type.Literal("user_stopped"),
      Type.Literal("app_shutdown"),
      Type.Literal("policy_stopped"),
    ]),
    last_client_seq: Type.Number({ minimum: 0 }),
  }),
});

export const ResumeRequestMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("resume.request"),
  payload: Type.Object({
    previous_connection_id: Type.String({ minLength: 1 }),
    last_client_seq: Type.Number({ minimum: 0 }),
    last_server_seq: Type.Number({ minimum: 0 }),
  }),
});

export const AuthAcceptedMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("auth.accepted"),
  payload: Type.Object({
    connection_id: Type.String({ minLength: 1 }),
    workspace_id: Type.String({ minLength: 1 }),
    policy: Type.Object({
      screen_context_allowed: Type.Boolean(),
      cloud_stt_allowed: Type.Boolean(),
      direct_provider_stt_allowed: Type.Literal(false),
      retention_mode: RetentionMode,
      max_local_audio_buffer_ms: Type.Number({ minimum: 0 }),
    }),
  }),
});

const TranscriptPayload = Type.Object({
  segment_id: Type.String({ minLength: 1 }),
  speaker: Speaker,
  text: Type.String(),
  start_ms: Type.Number({ minimum: 0 }),
  end_ms: Type.Number({ minimum: 0 }),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
});

export const TranscriptPartialMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("transcript.partial"),
  payload: TranscriptPayload,
});

export const TranscriptFinalMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("transcript.final"),
  payload: TranscriptPayload,
});

export const SuggestionStreamTokenMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("suggestion.stream_token"),
  payload: Type.Object({
    suggestion_id: Type.String({ minLength: 1 }),
    request_id: Type.String({ minLength: 1 }),
    token: Type.String(),
    index: Type.Number({ minimum: 0 }),
  }),
});

export const SuggestionCompleteMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("suggestion.complete"),
  payload: Type.Object({
    suggestion_id: Type.String({ minLength: 1 }),
    request_id: Type.String({ minLength: 1 }),
    kind: SuggestionKind,
    content: Type.String(),
    sources: Type.Array(
      Type.Object({
        document_id: Type.String({ minLength: 1 }),
        title: Type.String(),
        chunk_id: Type.String({ minLength: 1 }),
      }),
    ),
    confidence: Confidence,
    prompt_version: Type.String({ minLength: 1 }),
    model: Type.String({ minLength: 1 }),
  }),
});

export const SessionStatusMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("session.status"),
  payload: Type.Object({
    mode: SessionMode,
    message: Type.String(),
    recoverable: Type.Boolean(),
  }),
});

export const ErrorMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.Optional(Type.String({ minLength: 1 })),
  type: Type.Literal("error"),
  payload: Type.Object({
    code: ErrorCode,
    message: Type.String(),
    recoverable: Type.Boolean(),
    retry_after_ms: Type.Optional(Type.Number({ minimum: 0 })),
  }),
});

export const FlowControlMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("flow_control"),
  payload: Type.Object({
    audio_paused: Type.Boolean(),
    reason: Type.Literal("server_backpressure"),
    retry_after_ms: Type.Number({ minimum: 0 }),
  }),
});

export const SessionClosedMessageSchema = Type.Object({
  ...MessageEnvelopeFields,
  session_id: Type.String({ minLength: 1 }),
  type: Type.Literal("session.closed"),
  payload: Type.Object({
    reason: ClosedReason,
    final_server_seq: Type.Number({ minimum: 0 }),
  }),
});

export const RealtimeJsonMessageSchema = Type.Union([
  AuthHelloMessageSchema,
  SessionStartMessageSchema,
  AudioChunkMetaMessageSchema,
  AudioGapMessageSchema,
  ContextUpdateMessageSchema,
  SuggestionRequestMessageSchema,
  SessionEndMessageSchema,
  ResumeRequestMessageSchema,
  AuthAcceptedMessageSchema,
  TranscriptPartialMessageSchema,
  TranscriptFinalMessageSchema,
  SuggestionStreamTokenMessageSchema,
  SuggestionCompleteMessageSchema,
  SessionStatusMessageSchema,
  ErrorMessageSchema,
  FlowControlMessageSchema,
  SessionClosedMessageSchema,
]);

export type RealtimeJsonMessage = Static<typeof RealtimeJsonMessageSchema>;
export type AudioChunkMetaMessage = Static<typeof AudioChunkMetaMessageSchema>;
export type AudioGapMessage = Static<typeof AudioGapMessageSchema>;

export const realtimeJsonSchemas = {
  "realtime-message": RealtimeJsonMessageSchema,
  "audio-chunk-meta": AudioChunkMetaMessageSchema,
  "audio-gap": AudioGapMessageSchema,
  "session-closed": SessionClosedMessageSchema,
} satisfies Record<string, TSchema>;

export function validateRealtimeJsonMessage(value: unknown): value is RealtimeJsonMessage {
  return Value.Check(RealtimeJsonMessageSchema, value);
}

export function realtimeJsonMessageErrors(value: unknown): string[] {
  return [...Value.Errors(RealtimeJsonMessageSchema, value)].map((error) => error.message);
}
