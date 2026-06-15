import type { Actor, WorkspaceMembership, WorkspaceRole } from "@dokeza/authz";
import { REALTIME_PROTOCOL_VERSION } from "@dokeza/contracts";

// ---------------------------------------------------------------------------
// Actor and workspace fixtures
// ---------------------------------------------------------------------------

export function createTestMembership(
  overrides: Partial<WorkspaceMembership> = {},
): WorkspaceMembership {
  return {
    workspaceId: "ws_test_1",
    userId: "user_test_1",
    role: "member",
    ...overrides,
  };
}

export function createTestActor(
  overrides: Partial<Actor> & { role?: WorkspaceRole; workspaceId?: string } = {},
): Actor {
  const { role, workspaceId, ...actorOverrides } = overrides;
  const userId = actorOverrides.userId ?? "user_test_1";
  const memberships = actorOverrides.memberships ?? [
    createTestMembership({
      userId,
      role: role ?? "member",
      workspaceId: workspaceId ?? "ws_test_1",
    }),
  ];

  return { userId, memberships };
}

// ---------------------------------------------------------------------------
// Protocol message envelope
// ---------------------------------------------------------------------------

let seqCounter = 0;

export function resetSeqCounter(): void {
  seqCounter = 0;
}

export function createTestEnvelope(sessionId = "sess_test_1") {
  seqCounter += 1;
  return {
    protocol_version: REALTIME_PROTOCOL_VERSION,
    seq: seqCounter,
    session_id: sessionId,
    sent_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Client-to-server message factories
// ---------------------------------------------------------------------------

export function createAuthHelloMessage(overrides: Record<string, unknown> = {}) {
  return {
    ...createTestEnvelope(""),
    session_id: undefined,
    type: "auth.hello" as const,
    payload: {
      token: "test_token_valid",
      client_version: "0.1.0",
      platform: "windows" as const,
      device_id: "dev_test_1",
      ...overrides,
    },
  };
}

export function createSessionStartMessage(workspaceId = "ws_test_1", sessionId = "sess_test_1") {
  return {
    ...createTestEnvelope(sessionId),
    type: "session.start" as const,
    payload: {
      workspace_id: workspaceId,
      meeting_source: "test",
      capture: {
        microphone: true,
        system_audio: false,
        screen_context: false,
      },
      processing: {
        stt: "cloud" as const,
        llm: "cloud" as const,
        retrieval: "cloud" as const,
      },
    },
  };
}

export function createAudioChunkMeta(chunkIndex = 0, byteLength = 3200, sessionId = "sess_test_1") {
  return {
    ...createTestEnvelope(sessionId),
    type: "audio.chunk_meta" as const,
    payload: {
      chunk_id: `aud_test_${chunkIndex}`,
      chunk_index: chunkIndex,
      stream: "microphone" as const,
      format: "pcm_s16le" as const,
      sample_rate_hz: 16000 as const,
      channels: 1 as const,
      duration_ms: 100,
      timestamp_ms: chunkIndex * 100,
      byte_length: byteLength,
    },
  };
}

export function createSessionEndMessage(lastClientSeq: number, sessionId = "sess_test_1") {
  return {
    ...createTestEnvelope(sessionId),
    type: "session.end" as const,
    payload: {
      reason: "user_stopped" as const,
      last_client_seq: lastClientSeq,
    },
  };
}

// ---------------------------------------------------------------------------
// Server-to-client message factories
// ---------------------------------------------------------------------------

export function createAuthAcceptedMessage(
  connectionId = "conn_test_1",
  workspaceId = "ws_test_1",
  sessionId = "sess_test_1",
) {
  return {
    ...createTestEnvelope(sessionId),
    type: "auth.accepted" as const,
    payload: {
      connection_id: connectionId,
      workspace_id: workspaceId,
      policy: {
        screen_context_allowed: true,
        cloud_stt_allowed: true,
        direct_provider_stt_allowed: false as const,
        retention_mode: "7_days" as const,
        max_local_audio_buffer_ms: 300000,
      },
    },
  };
}

export function createTranscriptFinalMessage(
  segmentId: string,
  text: string,
  sessionId = "sess_test_1",
) {
  return {
    ...createTestEnvelope(sessionId),
    type: "transcript.final" as const,
    payload: {
      segment_id: segmentId,
      speaker: "remote" as const,
      text,
      start_ms: 0,
      end_ms: 1000,
      confidence: 0.92,
    },
  };
}

export function createErrorMessage(
  code: string,
  message: string,
  recoverable = true,
  sessionId?: string,
) {
  return {
    ...createTestEnvelope(sessionId ?? ""),
    session_id: sessionId,
    type: "error" as const,
    payload: {
      code,
      message,
      recoverable,
    },
  };
}
