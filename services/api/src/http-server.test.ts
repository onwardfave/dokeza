import { describe, expect, it, afterEach } from "vitest";
import { createDokezaAuthTokenService } from "@dokeza/auth";
import type { Actor } from "@dokeza/authz";
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

  const fixedNow = new Date("2026-07-02T00:00:00.000Z");
  const defaultEnv = {
    DOKEZA_ENV: "test",
    DOKEZA_AUTH_SIGNING_SECRET: "test_signing_secret_at_least_32_chars",
  };

  function createTestAuthService() {
    return createDokezaAuthTokenService({
      issuer: "https://auth.local.dokeza.dev",
      audience: "dokeza",
      signingSecret: "test_signing_secret_at_least_32_chars",
      now: () => fixedNow,
    });
  }

  function issueApiToken(actor: Actor): string {
    return createTestAuthService().issueToken({
      actor,
      purpose: "api_access",
      expiresInSeconds: 3600,
      developmentOnly: true,
    });
  }

  async function startServer(env?: NodeJS.ProcessEnv): Promise<number> {
    handle = createHttpServer({
      env: env ?? defaultEnv,
      now: () => fixedNow,
    });
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

  it("issues a development-only API token outside production", async () => {
    const port = await startServer();
    const response = await fetch(`http://127.0.0.1:${port}/v1/dev/auth/token`, {
      method: "POST",
      body: JSON.stringify({
        user_id: "user_dev_1",
        workspace_id: "ws_dev_1",
        role: "admin",
        display_name: "Dev User",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.token_type).toBe("Bearer");
    expect(body.user_id).toBe("user_dev_1");
    expect(body.development_only).toBe(true);
    expect(body.token).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("test_signing_secret");
  });

  it("disables the development token endpoint when configured off", async () => {
    const port = await startServer({
      ...defaultEnv,
      DOKEZA_DEV_AUTH_ENABLED: "false",
    });
    const response = await fetch(`http://127.0.0.1:${port}/v1/dev/auth/token`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "dev_auth_unavailable" });
  });

  it("returns the authenticated profile and workspace list from an API token", async () => {
    const actor: Actor = {
      userId: "user_1",
      memberships: [
        { userId: "user_1", workspaceId: "ws_1", role: "member" },
        { userId: "user_1", workspaceId: "ws_2", role: "owner" },
      ],
    };
    const token = issueApiToken(actor);
    const port = await startServer();

    const profile = await fetch(`http://127.0.0.1:${port}/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(profile.status).toBe(200);
    expect(await profile.json()).toEqual({
      user: {
        user_id: "user_1",
        display_name: "user_1",
        development_only: true,
      },
    });

    const workspaces = await fetch(`http://127.0.0.1:${port}/v1/workspaces`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(workspaces.status).toBe(200);
    expect(await workspaces.json()).toEqual({
      workspaces: [
        { workspace_id: "ws_1", name: "Development Workspace ws_1", role: "member" },
        { workspace_id: "ws_2", name: "Development Workspace ws_2", role: "owner" },
      ],
    });
  });

  it("issues a short-lived realtime token for an authorized workspace", async () => {
    const token = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "admin" }],
    });
    const port = await startServer();

    const response = await fetch(`http://127.0.0.1:${port}/v1/realtime/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ workspace_id: "ws_1", device_id: "dev_1" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      token: string;
      token_type: string;
      expires_at: string;
      workspace_id: string;
      development_only: boolean;
    };
    expect(body.token_type).toBe("Bearer");
    expect(body.workspace_id).toBe("ws_1");
    expect(body.expires_at).toBe("2026-07-02T00:05:00.000Z");

    const validation = createTestAuthService().validateToken(body.token, "realtime_session");
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.principal.workspaceId).toBe("ws_1");
      expect(validation.principal.deviceId).toBe("dev_1");
    }
  });

  it("rejects missing, wrong-purpose, and cross-workspace realtime token requests", async () => {
    const port = await startServer();
    const missingAuth = await fetch(`http://127.0.0.1:${port}/v1/me`);
    expect(missingAuth.status).toBe(401);
    expect(await missingAuth.json()).toEqual({ error: "auth_required" });

    const realtimeToken = createTestAuthService().issueToken({
      actor: {
        userId: "user_1",
        memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
      },
      purpose: "realtime_session",
      workspaceId: "ws_1",
      expiresInSeconds: 300,
      developmentOnly: true,
    });
    const wrongPurpose = await fetch(`http://127.0.0.1:${port}/v1/workspaces`, {
      headers: { Authorization: `Bearer ${realtimeToken}` },
    });
    expect(wrongPurpose.status).toBe(401);
    expect(await wrongPurpose.json()).toEqual({ error: "auth_invalid" });

    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    const crossWorkspace = await fetch(`http://127.0.0.1:${port}/v1/realtime/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({ workspace_id: "ws_other" }),
    });
    expect(crossWorkspace.status).toBe(403);
    expect(await crossWorkspace.json()).toEqual({ error: "workspace_access_denied" });
  });
});
