import type { DesktopRealtimeSnapshot } from "../protocol/desktopRealtimeSession.js";
import { getLiveSessionStatusView } from "./liveSessionViewModel.js";

export interface OverlayView {
  tone: "muted" | "ok" | "warning" | "danger";
  title: string;
  meta: string;
}

export function getOverlayView(snapshot: DesktopRealtimeSnapshot): OverlayView {
  const status = getLiveSessionStatusView(snapshot.status);
  const latestTranscript = snapshot.transcripts.at(-1);

  if (isSuggestionsUnavailable(snapshot)) {
    return {
      tone: "warning",
      title: "Suggestions unavailable",
      meta: status.label,
    };
  }

  if (snapshot.status === "reconnecting") {
    return {
      tone: "warning",
      title: "Reconnecting",
      meta: reconnectMeta(snapshot),
    };
  }

  if (snapshot.status === "degraded") {
    return {
      tone: "warning",
      title: snapshot.lastError?.message ?? "Session degraded",
      meta: suggestionMeta(snapshot),
    };
  }

  if (latestTranscript !== undefined) {
    return {
      tone: status.tone,
      title: latestTranscript.text,
      meta: `${latestTranscript.speaker} / ${latestTranscript.final ? "final" : "partial"} / ${suggestionMeta(snapshot)}`,
    };
  }

  return {
    tone: status.tone,
    title: snapshot.status === "idle" ? "Ready" : status.label,
    meta: suggestionMeta(snapshot),
  };
}

function isSuggestionsUnavailable(snapshot: DesktopRealtimeSnapshot): boolean {
  const code = snapshot.lastError?.code;
  return (
    code === "llm_provider_timeout" ||
    code === "feature_unavailable" ||
    code === "workspace_policy_denied"
  );
}

function reconnectMeta(snapshot: DesktopRealtimeSnapshot): string {
  const parts = ["capture paused"];
  if (snapshot.nextReconnectDelayMs !== undefined) {
    parts.push(`${snapshot.nextReconnectDelayMs} ms`);
  }
  if ((snapshot.pendingAudioChunks ?? 0) > 0) {
    parts.push(`${snapshot.pendingAudioChunks} chunks buffered`);
  }

  return parts.join(" / ");
}

function suggestionMeta(snapshot: DesktopRealtimeSnapshot): string {
  const complete = snapshot.suggestions.filter(
    (suggestion) => suggestion.status === "complete",
  ).length;
  const streaming = snapshot.suggestions.filter(
    (suggestion) => suggestion.status === "streaming",
  ).length;

  if (streaming > 0) {
    return `${streaming} suggestion streaming`;
  }

  return `${complete} suggestions`;
}
