import { parseConfig } from "@dokeza/config";

import { createConfiguredRealtimeServer } from "./configured-server.js";

// Process entrypoint for the realtime service. Reads configuration from the
// environment, wires the configured WebSocket server (STT, persistence,
// suggestions, retrieval), and listens for realtime connections.
//
// The realtime service listens on REALTIME_PORT (default 3001) so it does not
// collide with the API service, which uses PORT (default 3000). Configuration
// is validated up front; error output is variable-name diagnostics only and
// never includes secrets.
const DEFAULT_REALTIME_PORT = 3001;

function readRealtimePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_REALTIME_PORT;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.error("[dokeza:realtime] REALTIME_PORT must be an integer from 1 to 65535.");
    process.exit(1);
  }
  return parsed;
}

function main(): void {
  const parsed = parseConfig(process.env, "realtime");
  if (!parsed.ok || parsed.config === undefined) {
    console.error("[dokeza:realtime] invalid configuration:");
    for (const error of parsed.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const config = parsed.config;
  const port = readRealtimePort(process.env.REALTIME_PORT);
  const handle = createConfiguredRealtimeServer(config);

  handle.httpServer.listen(port, "127.0.0.1", () => {
    console.log(
      `[dokeza:realtime] listening on ws://127.0.0.1:${port}/realtime (env=${config.environment}, stt=${config.providers.stt.provider}, llm=${config.providers.llm.provider})`,
    );
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[dokeza:realtime] ${signal} received; shutting down`);
    void handle
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error("[dokeza:realtime] error during shutdown", error);
        process.exit(1);
      });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
