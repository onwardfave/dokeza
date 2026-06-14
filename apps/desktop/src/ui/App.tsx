import { REALTIME_PROTOCOL_VERSION } from "@dokeza/contracts";
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
      </section>
    </main>
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
