import { parseConfig } from "@dokeza/config";
import type { TelemetryEvent } from "@dokeza/telemetry";

import { createHttpServer } from "./http-server.js";

// Process entrypoint for the API service. Reads configuration from the
// environment, boots the HTTP server, and listens on the configured PORT.
// Configuration is validated up front so a misconfigured environment fails
// with a clear boot error instead of per-request 500s. Error output is
// variable-name diagnostics only and never includes secrets.
function main(): void {
  const parsed = parseConfig(process.env, "api");
  if (!parsed.ok || parsed.config === undefined) {
    console.error("[dokeza:api] invalid configuration:");
    for (const error of parsed.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  const config = parsed.config;
  // Console telemetry is a local/test diagnostic only; event fields are already
  // redacted by createTelemetryEvent and never include token values.
  const telemetrySink =
    config.environment === "production"
      ? undefined
      : {
          emit(event: TelemetryEvent): void {
            console.log(`[dokeza:api] ${event.name} ${JSON.stringify(event.fields)}`);
          },
        };
  const handle = createHttpServer({
    env: process.env,
    ...(telemetrySink === undefined ? {} : { telemetrySink }),
  });

  handle.server.listen(config.port, "127.0.0.1", () => {
    console.log(
      `[dokeza:api] listening on http://127.0.0.1:${config.port} (env=${config.environment})`,
    );
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[dokeza:api] ${signal} received; shutting down`);
    void handle
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error("[dokeza:api] error during shutdown", error);
        process.exit(1);
      });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
