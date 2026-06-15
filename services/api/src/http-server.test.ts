import { describe, expect, it, afterEach } from "vitest";
import { createHttpServer, type HttpServerHandle } from "./http-server.js";

function getPort(handle: HttpServerHandle): number {
  const addr = handle.server.address();
  if (addr === null || typeof addr === "string") throw new Error("Server not listening");
  return addr.port;
}

describe("API HTTP Server", () => {
  let handle: HttpServerHandle | undefined;

  afterEach(async () => {
    if (handle !== undefined) {
      await handle.close();
      handle = undefined;
    }
  });

  async function startServer(env?: NodeJS.ProcessEnv): Promise<number> {
    handle = createHttpServer({ env: env ?? { DOKEZA_ENV: "test" } });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    return getPort(handle);
  }

  it("returns 200 with health response on GET /health", async () => {
    const port = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      service: "api",
      status: "ok",
      environment: "test",
    });
  });

  it("returns 404 for unknown paths", async () => {
    const port = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/unknown`);

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "not_found" });
  });

  it("returns 405 for non-GET requests to /health", async () => {
    const port = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/health`, { method: "POST" });

    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body).toEqual({ error: "method_not_allowed" });
  });

  it("returns 503 when config is invalid", async () => {
    const port = await startServer({ DOKEZA_ENV: "invalid_environment" });
    const response = await fetch(`http://127.0.0.1:${port}/health`);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: "service_unavailable" });
  });
});
