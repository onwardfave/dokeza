import {
  REALTIME_PROTOCOL_VERSION,
  type AudioChunkMetaMessage,
  type RealtimeJsonMessage,
  validateRealtimeJsonMessage,
} from "@dokeza/contracts";

export type DesktopPlatform = "windows" | "macos";

export interface DesktopSessionIdentity {
  sessionId: string;
  workspaceId: string;
  deviceId: string;
}

export interface RealtimeClientState {
  nextSeq: number;
}

export interface AuthHelloInput {
  token: string;
  clientVersion: string;
  platform: DesktopPlatform;
  deviceId: string;
}

export interface ResumeRequestInput {
  sessionId: string;
  previousConnectionId: string;
  lastClientSeq: number;
  lastServerSeq: number;
}

export interface SyntheticPcmChunk {
  meta: AudioChunkMetaMessage["payload"];
  bytes: Uint8Array;
}

export interface SyntheticPcmOptions {
  chunkCount?: number;
  samplesPerChunk?: number;
  sampleRateHz?: 16000;
  amplitude?: number;
}

interface SessionEnvelope {
  protocol_version: typeof REALTIME_PROTOCOL_VERSION;
  seq: number;
  session_id?: string;
  sent_at: string;
}

type SessionBoundEnvelope = SessionEnvelope & { session_id: string };

export function createInitialRealtimeClientState(): RealtimeClientState {
  return { nextSeq: 1 };
}

function nextEnvelope(state: RealtimeClientState, sessionId?: string): SessionEnvelope {
  const seq = state.nextSeq;
  state.nextSeq += 1;

  const envelope: SessionEnvelope = {
    protocol_version: REALTIME_PROTOCOL_VERSION,
    seq,
    sent_at: new Date().toISOString(),
  };

  if (sessionId !== undefined) {
    envelope.session_id = sessionId;
  }

  return envelope;
}

function nextSessionEnvelope(state: RealtimeClientState, sessionId: string): SessionBoundEnvelope {
  return {
    ...nextEnvelope(state),
    session_id: sessionId,
  };
}

export function createAuthHelloMessage(
  state: RealtimeClientState,
  input: AuthHelloInput,
): RealtimeJsonMessage {
  const message = {
    ...nextEnvelope(state),
    type: "auth.hello",
    payload: {
      token: input.token,
      client_version: input.clientVersion,
      platform: input.platform,
      device_id: input.deviceId,
    },
  } satisfies RealtimeJsonMessage;

  if (!validateRealtimeJsonMessage(message)) {
    throw new Error("invalid_auth_hello_message");
  }

  return message;
}

export function createSessionStartMessage(
  state: RealtimeClientState,
  identity: DesktopSessionIdentity,
): RealtimeJsonMessage {
  const message = {
    ...nextSessionEnvelope(state, identity.sessionId),
    type: "session.start",
    payload: {
      workspace_id: identity.workspaceId,
      meeting_source: "manual",
      capture: {
        microphone: true,
        system_audio: false,
        screen_context: false,
      },
      processing: {
        stt: "cloud",
        llm: "cloud",
        retrieval: "cloud",
      },
    },
  } satisfies RealtimeJsonMessage;

  if (!validateRealtimeJsonMessage(message)) {
    throw new Error("invalid_session_start_message");
  }

  return message;
}

export function createSessionEndMessage(
  state: RealtimeClientState,
  sessionId: string,
  reason: "user_stopped" | "app_shutdown" | "policy_stopped",
): RealtimeJsonMessage {
  const envelope = nextEnvelope(state, sessionId);
  const message = {
    ...nextSessionEnvelopeFromEnvelope(envelope, sessionId),
    type: "session.end",
    payload: {
      reason,
      last_client_seq: envelope.seq,
    },
  } satisfies RealtimeJsonMessage;

  if (!validateRealtimeJsonMessage(message)) {
    throw new Error("invalid_session_end_message");
  }

  return message;
}

export function createResumeRequestMessage(
  state: RealtimeClientState,
  input: ResumeRequestInput,
): RealtimeJsonMessage {
  const message = {
    ...nextSessionEnvelope(state, input.sessionId),
    type: "resume.request",
    payload: {
      previous_connection_id: input.previousConnectionId,
      last_client_seq: input.lastClientSeq,
      last_server_seq: input.lastServerSeq,
    },
  } satisfies RealtimeJsonMessage;

  if (!validateRealtimeJsonMessage(message)) {
    throw new Error("invalid_resume_request_message");
  }

  return message;
}

export function createAudioChunkMetaMessage(
  state: RealtimeClientState,
  sessionId: string,
  payload: AudioChunkMetaMessage["payload"],
): AudioChunkMetaMessage {
  const message = {
    ...nextSessionEnvelope(state, sessionId),
    type: "audio.chunk_meta",
    payload,
  } satisfies AudioChunkMetaMessage;

  if (!validateRealtimeJsonMessage(message)) {
    throw new Error("invalid_audio_chunk_meta_message");
  }

  return message;
}

function nextSessionEnvelopeFromEnvelope(
  envelope: SessionEnvelope,
  sessionId: string,
): SessionBoundEnvelope {
  return {
    ...envelope,
    session_id: sessionId,
  };
}

export function createSyntheticPcmChunks(options: SyntheticPcmOptions = {}): SyntheticPcmChunk[] {
  const chunkCount = options.chunkCount ?? 3;
  const samplesPerChunk = options.samplesPerChunk ?? 1600;
  const sampleRateHz = options.sampleRateHz ?? 16000;
  const amplitude = clampAmplitude(options.amplitude ?? 1200);
  const durationMs = Math.max(1, Math.round((samplesPerChunk / sampleRateHz) * 1000));
  const chunks: SyntheticPcmChunk[] = [];

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const bytes = new Uint8Array(samplesPerChunk * 2);
    const view = new DataView(bytes.buffer);
    for (let sampleIndex = 0; sampleIndex < samplesPerChunk; sampleIndex += 1) {
      const phase = (chunkIndex * samplesPerChunk + sampleIndex) % 32;
      const sample = phase < 16 ? amplitude : -amplitude;
      view.setInt16(sampleIndex * 2, sample, true);
    }

    chunks.push({
      meta: {
        chunk_id: `synthetic_${chunkIndex}`,
        chunk_index: chunkIndex,
        stream: "microphone",
        format: "pcm_s16le",
        sample_rate_hz: sampleRateHz,
        channels: 1,
        duration_ms: durationMs,
        timestamp_ms: chunkIndex * durationMs,
        byte_length: bytes.byteLength,
      },
      bytes,
    });
  }

  return chunks;
}

function clampAmplitude(amplitude: number): number {
  return Math.max(0, Math.min(32767, Math.trunc(amplitude)));
}
