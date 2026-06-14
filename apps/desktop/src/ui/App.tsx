import { REALTIME_PROTOCOL_VERSION } from "@dokeza/contracts";
import { useMemo, useState } from "react";
import {
  formatDiagnosticDetails,
  isTauriRuntime,
  runDesktopDiagnostic,
  type DiagnosticAction,
  type DiagnosticOutcome,
} from "./desktopDiagnostics.js";
import { selectDesktopSurface } from "./surfaces.js";

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
        <DiagnosticsPanel />
      </section>
    </main>
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
