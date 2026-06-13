import {
  REALTIME_PROTOCOL_VERSION,
  type AudioChunkMetaMessage,
  type RealtimeJsonMessage,
  validateRealtimeJsonMessage,
} from "@dokeza/contracts";

export interface DesktopSessionIdentity {
  sessionId: string;
  workspaceId: string;
  deviceId: string;
}

export interface RealtimeClientState {
  nextSeq: number;
}

interface SessionEnvelope {
  protocol_version: typeof REALTIME_PROTOCOL_VERSION;
  seq: number;
  session_id: string;
  sent_at: string;
}

export function createInitialRealtimeClientState(): RealtimeClientState {
  return { nextSeq: 0 };
}

function nextEnvelope(state: RealtimeClientState, sessionId: string): SessionEnvelope {
  const seq = state.nextSeq;
  state.nextSeq += 1;

  return {
    protocol_version: REALTIME_PROTOCOL_VERSION,
    seq,
    session_id: sessionId,
    sent_at: new Date().toISOString(),
  };
}

export function createSessionStartMessage(
  state: RealtimeClientState,
  identity: DesktopSessionIdentity,
): RealtimeJsonMessage {
  const message = {
    ...nextEnvelope(state, identity.sessionId),
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

export function createAudioChunkMetaMessage(
  state: RealtimeClientState,
  sessionId: string,
  payload: AudioChunkMetaMessage["payload"],
): AudioChunkMetaMessage {
  const message = {
    ...nextEnvelope(state, sessionId),
    type: "audio.chunk_meta",
    payload,
  } satisfies AudioChunkMetaMessage;

  if (!validateRealtimeJsonMessage(message)) {
    throw new Error("invalid_audio_chunk_meta_message");
  }

  return message;
}
