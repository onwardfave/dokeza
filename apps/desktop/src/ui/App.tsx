import { REALTIME_PROTOCOL_VERSION } from "@dokeza/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DesktopRealtimeSessionClient,
  type DesktopRealtimeSnapshot,
} from "../protocol/desktopRealtimeSession.js";
import {
  formatDiagnosticDetails,
  isTauriRuntime,
  runDesktopDiagnostic,
  type DiagnosticAction,
  type DiagnosticOutcome,
} from "./desktopDiagnostics.js";
import {
  getLiveSessionDetail,
  getLiveSessionStatusView,
  toLiveTranscriptRows,
} from "./liveSessionViewModel.js";
import { selectDesktopSurface } from "./surfaces.js";

const initialLiveSessionSnapshot: DesktopRealtimeSnapshot = {
  status: "idle",
  lastClientSeq: 0,
  lastServerSeq: 0,
  transcripts: [],
};

export function App() {
  const surface = selectDesktopSurface(globalThis.location.hash);

  if (surface === "overlay") {
    return <OverlaySurface />;
  }

  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">Desktop Spike</p>
        <h1>Dokeza</h1>
        <dl>
          <div>
            <dt>Protocol</dt>
            <dd>{REALTIME_PROTOCOL_VERSION}</dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd>WebSocket over TLS</dd>
          </div>
          <div>
            <dt>STT route</dt>
            <dd>Backend adapter</dd>
          </div>
        </dl>
        <LiveSessionPanel />
        <DiagnosticsPanel />
      </section>
    </main>
  );
}

function LiveSessionPanel() {
  const [endpoint, setEndpoint] = useState("ws://127.0.0.1:3001/realtime");
  const [token, setToken] = useState("valid_token");
  const [snapshot, setSnapshot] = useState<DesktopRealtimeSnapshot>(initialLiveSessionSnapshot);
  const clientRef = useRef<DesktopRealtimeSessionClient | null>(null);
  const refreshTimerRef = useRef<number | undefined>(undefined);
  const status = getLiveSessionStatusView(snapshot.status);
  const detail = getLiveSessionDetail(snapshot);
  const transcriptRows = toLiveTranscriptRows(snapshot.transcripts);
  const canStart =
    snapshot.status === "idle" || snapshot.status === "closed" || snapshot.status === "failed";
  const canStop =
    snapshot.status === "connecting" ||
    snapshot.status === "connected" ||
    snapshot.status === "streaming" ||
    snapshot.status === "degraded";

  useEffect(() => {
    return () => window.clearInterval(refreshTimerRef.current);
  }, []);

  function refreshSnapshot() {
    const client = clientRef.current;
    if (client !== null) {
      setSnapshot(client.snapshot);
    }
  }

  function startRefreshLoop() {
    window.clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = window.setInterval(refreshSnapshot, 250);
  }

  function startSession() {
    const client = new DesktopRealtimeSessionClient({
      endpoint,
      token,
      clientVersion: "0.1.0",
      platform: "windows",
      deviceId: "dev_desktop_preview",
      syntheticAudio: {
        chunkCount: 3,
        samplesPerChunk: 1600,
      },
    });
    clientRef.current = client;
    client.startSyntheticSession();
    setSnapshot(client.snapshot);
    startRefreshLoop();
  }

  function stopSession() {
    clientRef.current?.stop("user_stopped");
    refreshSnapshot();
  }

  return (
    <section className="live-session" aria-labelledby="live-session-title">
      <div className="live-session-header">
        <div>
          <p className="eyebrow">Live Session</p>
          <h2 id="live-session-title">Synthetic realtime</h2>
        </div>
        <span className={`status-pill ${status.tone}`}>{status.label}</span>
      </div>
      <div className="live-session-controls">
        <label>
          <span>Endpoint</span>
          <input
            value={endpoint}
            onChange={(event) => setEndpoint(event.currentTarget.value)}
            disabled={!canStart}
          />
        </label>
        <label>
          <span>Dev token</span>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
            disabled={!canStart}
          />
        </label>
        <div className="live-session-buttons">
          <button type="button" disabled={!canStart} onClick={startSession}>
            Start synthetic
          </button>
          <button type="button" disabled={!canStop} onClick={stopSession}>
            Stop
          </button>
        </div>
      </div>
      <p className="live-session-detail">{detail}</p>
      <div className="live-transcript" aria-live="polite">
        {transcriptRows.length === 0 ? (
          <p className="live-transcript-empty">Transcript waiting</p>
        ) : (
          transcriptRows.map((row) => (
            <article className={`transcript-row ${row.state}`} key={row.id}>
              <div>
                <span>{row.speaker}</span>
                <strong>{row.state}</strong>
              </div>
              <p>{row.text}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function DiagnosticsPanel() {
  const [activeAction, setActiveAction] = useState<DiagnosticAction | null>(null);
  const [outcome, setOutcome] = useState<DiagnosticOutcome | null>(null);
  const nativeRuntimeAvailable = useMemo(() => isTauriRuntime(), []);
  const isRunning = activeAction !== null;
  const rows = outcome?.details === undefined ? [] : formatDiagnosticDetails(outcome.details);

  async function run(action: DiagnosticAction) {
    setActiveAction(action);
    setOutcome(null);

    try {
      setOutcome(await runDesktopDiagnostic(action));
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <section className="diagnostics" aria-labelledby="diagnostics-title">
      <div className="diagnostics-header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h2 id="diagnostics-title">Capability QA</h2>
        </div>
        <span className={nativeRuntimeAvailable ? "status-pill ok" : "status-pill muted"}>
          {nativeRuntimeAvailable ? "Native runtime" : "Browser preview"}
        </span>
      </div>
      <div className="diagnostics-actions">
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("microphone")}
        >
          {activeAction === "microphone" ? "Running..." : "Microphone"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("outputDevices")}
        >
          {activeAction === "outputDevices" ? "Running..." : "Outputs"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("systemLoopback")}
        >
          {activeAction === "systemLoopback" ? "Running..." : "Loopback"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("localCache")}
        >
          {activeAction === "localCache" ? "Running..." : "Local cache"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("crashDiagnostics")}
        >
          {activeAction === "crashDiagnostics" ? "Running..." : "Crash diagnostics"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("realtimeWebSocket")}
        >
          {activeAction === "realtimeWebSocket" ? "Running..." : "Realtime WS"}
        </button>
        <button
          type="button"
          disabled={isRunning || !nativeRuntimeAvailable}
          onClick={() => void run("updatePolicy")}
        >
          {activeAction === "updatePolicy" ? "Running..." : "Update policy"}
        </button>
      </div>
      <div className="diagnostics-result" aria-live="polite">
        {outcome === null ? (
          <p className="diagnostics-placeholder">
            {nativeRuntimeAvailable ? "No probe run yet." : "Open the Tauri app for native probes."}
          </p>
        ) : (
          <>
            <p className={`diagnostics-message ${outcome.status}`}>{outcome.message}</p>
            {rows.length > 0 ? (
              <dl className="diagnostics-details">
                {rows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function OverlaySurface() {
  return (
    <main className="overlay-shell" data-tauri-drag-region>
      <section className="overlay-panel" data-tauri-drag-region>
        <div className="overlay-status" aria-label="Capture status" />
        <div>
          <p className="overlay-eyebrow">Dokeza</p>
          <p className="overlay-title">Ready for live assistance</p>
        </div>
      </section>
    </main>
  );
}
