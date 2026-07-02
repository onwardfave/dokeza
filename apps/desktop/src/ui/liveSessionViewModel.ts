import type {
  DesktopRealtimeSnapshot,
  DesktopRealtimeStatus,
  DesktopRealtimeTranscript,
} from "../protocol/desktopRealtimeSession.js";

export interface LiveSessionStatusView {
  label: string;
  tone: "muted" | "ok" | "warning" | "danger";
}

export interface LiveTranscriptRow {
  id: string;
  speaker: string;
  text: string;
  state: "partial" | "final";
}

const statusLabels: Record<DesktopRealtimeStatus, LiveSessionStatusView> = {
  idle: { label: "Idle", tone: "muted" },
  connecting: { label: "Connecting", tone: "warning" },
  connected: { label: "Connected", tone: "ok" },
  streaming: { label: "Streaming", tone: "ok" },
  reconnecting: { label: "Reconnecting", tone: "warning" },
  degraded: { label: "Degraded", tone: "warning" },
  closed: { label: "Closed", tone: "muted" },
  failed: { label: "Failed", tone: "danger" },
};

export function getLiveSessionStatusView(status: DesktopRealtimeStatus): LiveSessionStatusView {
  return statusLabels[status];
}

export function getLiveSessionDetail(snapshot: DesktopRealtimeSnapshot): string {
  if (snapshot.lastError !== undefined) {
    return snapshot.lastError.message;
  }

  if (snapshot.statusMessage !== undefined) {
    return snapshot.statusMessage;
  }

  if (snapshot.sessionId !== undefined && snapshot.connectionId !== undefined) {
    return `${snapshot.sessionId} / ${snapshot.connectionId}`;
  }

  return "No active session";
}

export function toLiveTranscriptRows(
  transcripts: DesktopRealtimeTranscript[],
): LiveTranscriptRow[] {
  return transcripts.map((transcript) => ({
    id: transcript.segmentId,
    speaker: transcript.speaker,
    text: transcript.text,
    state: transcript.final ? "final" : "partial",
  }));
}
