import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { createHealthResponse } from "./index.js";

export interface HttpServerOptions {
  port?: number;
  env?: NodeJS.ProcessEnv;
}

export interface HttpServerHandle {
  server: Server;
  close(): Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function handleHealth(req: IncomingMessage, res: ServerResponse, env: NodeJS.ProcessEnv): void {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const health = createHealthResponse(env);
    sendJson(res, 200, health);
  } catch {
    sendJson(res, 503, { error: "service_unavailable" });
  }
}

export function createHttpServer(options: HttpServerOptions = {}): HttpServerHandle {
  const env = options.env ?? process.env;

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/health" || url.pathname === "/health/") {
      handleHealth(req, res, env);
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}
