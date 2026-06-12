import { REALTIME_PROTOCOL_VERSION } from "@dokeza/contracts";

export function App() {
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
