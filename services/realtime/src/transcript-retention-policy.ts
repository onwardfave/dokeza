import type { RealtimeJsonMessage } from "@dokeza/contracts";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";

type AuthAcceptedMessage = Extract<RealtimeJsonMessage, { type: "auth.accepted" }>;

export type TranscriptRetentionMode = AuthAcceptedMessage["payload"]["policy"]["retention_mode"];
export type TranscriptTimelineRecordKind = "segment" | "gap";
export type TranscriptTimelinePersistenceAction = "persist" | "skip";
export type TranscriptTimelinePersistenceReason =
  | "cloud_retention_allowed"
  | "live_only_no_storage"
  | "local_only_no_cloud_storage"
  | "unknown_retention_mode";

export interface TranscriptTimelinePersistenceInput {
  retentionMode: TranscriptRetentionMode | string;
  timelineRecordKind: TranscriptTimelineRecordKind;
  workspaceId: string;
  sessionId: string;
}

export interface TranscriptTimelinePersistenceDecision {
  action: TranscriptTimelinePersistenceAction;
  reason: TranscriptTimelinePersistenceReason;
  telemetry: TelemetryEvent;
}

const cloudPersistenceModes = new Set<string>(["7_days", "30_days", "1_year", "indefinite"]);

export function evaluateTranscriptTimelinePersistence(
  input: TranscriptTimelinePersistenceInput,
): TranscriptTimelinePersistenceDecision {
  const reason = getPersistenceReason(input.retentionMode);
  const action: TranscriptTimelinePersistenceAction =
    reason === "cloud_retention_allowed" ? "persist" : "skip";

  return {
    action,
    reason,
    telemetry: createTelemetryEvent("realtime.transcript_timeline_retention_decision", {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      retentionMode: input.retentionMode,
      timelineRecordKind: input.timelineRecordKind,
      action,
      reason,
    }),
  };
}

function getPersistenceReason(retentionMode: string): TranscriptTimelinePersistenceReason {
  if (cloudPersistenceModes.has(retentionMode)) {
    return "cloud_retention_allowed";
  }

  if (retentionMode === "live_only") {
    return "live_only_no_storage";
  }

  if (retentionMode === "local_only") {
    return "local_only_no_cloud_storage";
  }

  return "unknown_retention_mode";
}
