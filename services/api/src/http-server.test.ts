import { describe, expect, it, afterEach } from "vitest";
import { createDokezaAuthTokenService } from "@dokeza/auth";
import type { Actor } from "@dokeza/authz";
import { InMemoryKnowledgeRepository } from "@dokeza/knowledge";
import type { TelemetryEvent } from "@dokeza/telemetry";
import { createHttpServer, type HttpServerHandle } from "./http-server.js";
import { InMemoryIdentityRepository } from "./identity-repository.js";
import { InMemoryMeetingReviewRepository } from "./meeting-review-repository.js";

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

  const meetingRepository = new InMemoryMeetingReviewRepository([
    {
      meeting: {
        meeting_id: "sess_ws_1",
        workspace_id: "ws_1",
        created_by: "user_1",
        meeting_source: "manual",
        status: "ended",
        started_at: "2026-07-02T00:00:00.000Z",
        ended_at: "2026-07-02T00:10:00.000Z",
        segment_count: 1,
        gap_count: 1,
      },
      segments: [
        {
          segment_id: "seg_1",
          speaker: "user",
          text: "follow up with pricing",
          start_ms: 0,
          end_ms: 1200,
          confidence: 0.91,
        },
      ],
      gaps: [
        {
          stream: "microphone",
          start_ms: 1200,
          end_ms: 1500,
          dropped_chunks: 3,
          reason: "user_paused_capture",
        },
      ],
    },
    {
      meeting: {
        meeting_id: "sess_ws_2",
        workspace_id: "ws_2",
        created_by: "user_2",
        meeting_source: "manual",
        status: "ended",
        started_at: "2026-07-02T01:00:00.000Z",
        ended_at: "2026-07-02T01:10:00.000Z",
        segment_count: 0,
        gap_count: 0,
      },
    },
  ]);
  const knowledgeRepository = new InMemoryKnowledgeRepository({
    now: () => fixedNow,
    idGenerator: createSequenceIds("api_doc", "api_chunk", "extra"),
    seeds: [
      {
        document: {
          document_id: "doc_ws_2",
          workspace_id: "ws_2",
          title: "Other Workspace FAQ",
          source: "manual_upload",
          status: "active",
          chunk_count: 1,
          created_by: "user_2",
        },
        chunks: [
          {
            chunk_id: "chunk_ws_2",
            document_id: "doc_ws_2",
            chunk_index: 0,
            text: "Workspace two confidential pricing.",
            permission_tags: [],
          },
        ],
      },
    ],
  });

  async function startServer(env?: NodeJS.ProcessEnv): Promise<number> {
    handle = createHttpServer({
      env: env ?? defaultEnv,
      now: () => fixedNow,
      meetingRepository,
      knowledgeRepository,
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

  it("lets workspace admins manage durable memberships", async () => {
    const identityRepository = new InMemoryIdentityRepository([
      {
        providerSubject: "provider_admin",
        userId: "user_admin",
        email: "admin@example.com",
        displayName: "Admin User",
        memberships: [{ userId: "user_admin", workspaceId: "ws_1", role: "admin" }],
      },
    ]);
    handle = createHttpServer({
      env: defaultEnv,
      now: () => fixedNow,
      meetingRepository,
      knowledgeRepository,
      identityRepository,
    });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = getPort(handle);
    const token = issueApiToken({
      userId: "user_admin",
      memberships: [{ userId: "user_admin", workspaceId: "ws_1", role: "admin" }],
    });

    const upsert = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/memberships`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        user_id: "user_member",
        email: "member@example.com",
        display_name: "Member User",
        role: "member",
      }),
    });
    expect(upsert.status).toBe(200);
    expect(await upsert.json()).toEqual({
      workspace_id: "ws_1",
      membership: {
        user_id: "user_member",
        email: "member@example.com",
        display_name: "Member User",
        role: "member",
      },
    });

    const list = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/memberships`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({
      workspace_id: "ws_1",
      memberships: [
        {
          user_id: "user_admin",
          email: "admin@example.com",
          display_name: "Admin User",
          role: "admin",
        },
        {
          user_id: "user_member",
          email: "member@example.com",
          display_name: "Member User",
          role: "member",
        },
      ],
    });

    const deleted = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/memberships/user_member`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({
      workspace_id: "ws_1",
      user_id: "user_member",
      deleted: true,
    });
  });

  it("denies membership management to non-admin workspace members", async () => {
    const port = await startServer();
    const token = issueApiToken({
      userId: "user_member",
      memberships: [{ userId: "user_member", workspaceId: "ws_1", role: "member" }],
    });

    const response = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/memberships`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "workspace_access_denied" });
  });

  it("enforces owner-only and last-owner membership boundaries", async () => {
    const identityRepository = new InMemoryIdentityRepository([
      {
        providerSubject: "provider_owner",
        userId: "user_owner",
        email: "owner@example.com",
        displayName: "Owner",
        memberships: [{ userId: "user_owner", workspaceId: "ws_1", role: "owner" }],
      },
      {
        providerSubject: "provider_admin",
        userId: "user_admin",
        email: "admin@example.com",
        displayName: "Admin",
        memberships: [{ userId: "user_admin", workspaceId: "ws_1", role: "admin" }],
      },
    ]);
    handle = createHttpServer({
      env: defaultEnv,
      now: () => fixedNow,
      meetingRepository,
      knowledgeRepository,
      identityRepository,
    });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = getPort(handle);
    const adminToken = issueApiToken({
      userId: "user_admin",
      memberships: [{ userId: "user_admin", workspaceId: "ws_1", role: "admin" }],
    });
    const ownerToken = issueApiToken({
      userId: "user_owner",
      memberships: [{ userId: "user_owner", workspaceId: "ws_1", role: "owner" }],
    });

    const promote = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/memberships`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        user_id: "user_admin",
        email: "admin@example.com",
        role: "owner",
      }),
    });
    expect(promote.status).toBe(403);
    expect(await promote.json()).toEqual({ error: "membership_owner_required" });

    const removeLastOwner = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/memberships/user_owner`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${ownerToken}` },
      },
    );
    expect(removeLastOwner.status).toBe(409);
    expect(await removeLastOwner.json()).toEqual({ error: "last_workspace_owner" });
  });

  it("exchanges a hosted provider token for a Dokeza API token and workspace list", async () => {
    const identityRepository = new InMemoryIdentityRepository([
      {
        providerSubject: "provider_user_1",
        userId: "user_provider_1",
        email: "provider@example.com",
        displayName: "Provider User",
        memberships: [{ userId: "user_provider_1", workspaceId: "ws_provider", role: "admin" }],
      },
    ]);
    handle = createHttpServer({
      env: {
        ...defaultEnv,
        DOKEZA_HOSTED_AUTH_ENABLED: "true",
        DOKEZA_HOSTED_AUTH_ISSUER: "https://idp.example.com/",
        DOKEZA_HOSTED_AUTH_AUDIENCE: "dokeza-api",
        DOKEZA_HOSTED_AUTH_JWKS_URL: "https://idp.example.com/.well-known/jwks.json",
      },
      now: () => fixedNow,
      providerVerifier: {
        verify: async (token) =>
          token === "provider-token"
            ? {
                ok: true,
                identity: {
                  providerSubject: "provider_user_1",
                  email: "provider@example.com",
                  displayName: "Provider User",
                },
              }
            : { ok: false, reason: "invalid_signature" },
      },
      identityRepository,
    });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = getPort(handle);

    const response = await fetch(`http://127.0.0.1:${port}/v1/auth/provider/exchange`, {
      method: "POST",
      body: JSON.stringify({ provider_token: "provider-token", device_id: "dev_1" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      token: string;
      token_type: string;
      user: { user_id: string; display_name: string; development_only: boolean };
      workspaces: Array<{ workspace_id: string; role: string }>;
    };
    expect(body.token_type).toBe("Bearer");
    expect(body.user).toEqual({
      user_id: "user_provider_1",
      display_name: "Provider User",
      development_only: false,
    });
    expect(body.workspaces).toEqual([
      { workspace_id: "ws_provider", name: "ws_provider", role: "admin" },
    ]);
    expect(JSON.stringify(body)).not.toContain("provider-token");

    const validation = createTestAuthService().validateToken(body.token, "api_access");
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.principal.actor).toEqual({
        userId: "user_provider_1",
        memberships: [{ userId: "user_provider_1", workspaceId: "ws_provider", role: "admin" }],
      });
      expect(validation.principal.claims.development_only).toBe(false);
    }
  });

  it("emits metadata-only auth telemetry for hosted provider exchange", async () => {
    const telemetry: TelemetryEvent[] = [];
    const identityRepository = new InMemoryIdentityRepository([
      {
        providerSubject: "provider_user_telemetry",
        userId: "user_provider_telemetry",
        email: "telemetry@example.com",
        displayName: "Telemetry User",
        memberships: [
          { userId: "user_provider_telemetry", workspaceId: "ws_provider", role: "admin" },
        ],
      },
    ]);
    handle = createHttpServer({
      env: {
        ...defaultEnv,
        DOKEZA_HOSTED_AUTH_ENABLED: "true",
        DOKEZA_HOSTED_AUTH_ISSUER: "https://idp.example.com/",
        DOKEZA_HOSTED_AUTH_AUDIENCE: "dokeza-api",
        DOKEZA_HOSTED_AUTH_JWKS_URL: "https://idp.example.com/.well-known/jwks.json",
      },
      now: () => fixedNow,
      providerVerifier: {
        verify: async (token) =>
          token === "provider-token-sensitive"
            ? {
                ok: true,
                identity: {
                  providerSubject: "provider_user_telemetry",
                  email: "telemetry@example.com",
                  displayName: "Telemetry User",
                },
              }
            : { ok: false, reason: "invalid_signature" },
      },
      identityRepository,
      telemetrySink: {
        emit: (event) => {
          telemetry.push(event);
        },
      },
    });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = getPort(handle);

    const response = await fetch(`http://127.0.0.1:${port}/v1/auth/provider/exchange`, {
      method: "POST",
      body: JSON.stringify({ provider_token: "provider-token-sensitive", device_id: "dev_1" }),
    });

    expect(response.status).toBe(200);
    expect(telemetry).toContainEqual({
      name: "api.auth_request",
      fields: {
        route: "provider_exchange",
        method: "POST",
        status: 200,
        statusCategory: "2xx",
        latencyMs: 0,
        environment: "test",
        developmentOnly: false,
        userId: "user_provider_telemetry",
      },
    });
    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain("provider-token-sensitive");
    expect(serialized).not.toContain("dev_1");
  });

  it("fails provider exchange closed when hosted auth is unavailable or invalid", async () => {
    const disabledPort = await startServer();
    const disabled = await fetch(`http://127.0.0.1:${disabledPort}/v1/auth/provider/exchange`, {
      method: "POST",
      body: JSON.stringify({ provider_token: "provider-token" }),
    });
    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toEqual({ error: "auth_provider_unavailable" });
    await handle?.close();
    handle = undefined;

    handle = createHttpServer({
      env: {
        ...defaultEnv,
        DOKEZA_HOSTED_AUTH_ENABLED: "true",
        DOKEZA_HOSTED_AUTH_ISSUER: "https://idp.example.com/",
        DOKEZA_HOSTED_AUTH_AUDIENCE: "dokeza-api",
        DOKEZA_HOSTED_AUTH_JWKS_URL: "https://idp.example.com/.well-known/jwks.json",
      },
      now: () => fixedNow,
      providerVerifier: {
        verify: async () => ({ ok: false, reason: "invalid_signature" }),
      },
    });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    const invalidPort = getPort(handle);

    const invalid = await fetch(`http://127.0.0.1:${invalidPort}/v1/auth/provider/exchange`, {
      method: "POST",
      body: JSON.stringify({ provider_token: "provider-token" }),
    });
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toEqual({ error: "auth_invalid" });
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

  it("emits metadata-only auth telemetry for API token auth and realtime token issuance", async () => {
    const telemetry: TelemetryEvent[] = [];
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    handle = createHttpServer({
      env: defaultEnv,
      now: () => fixedNow,
      meetingRepository,
      knowledgeRepository,
      telemetrySink: {
        emit: (event) => {
          telemetry.push(event);
        },
      },
    });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = getPort(handle);

    await fetch(`http://127.0.0.1:${port}/v1/me`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    await fetch(`http://127.0.0.1:${port}/v1/workspaces`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    await fetch(`http://127.0.0.1:${port}/v1/realtime/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({ workspace_id: "ws_1", device_id: "dev_1" }),
    });
    await fetch(`http://127.0.0.1:${port}/v1/realtime/token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({ workspace_id: "ws_other" }),
    });

    expect(telemetry.map((event) => event.fields.route)).toEqual([
      "profile",
      "workspace_list",
      "realtime_token",
      "realtime_token",
    ]);
    expect(telemetry[2]?.fields).toMatchObject({
      status: 200,
      statusCategory: "2xx",
      userId: "user_1",
      workspaceId: "ws_1",
      developmentOnly: true,
    });
    expect(telemetry[3]?.fields).toMatchObject({
      status: 403,
      statusCategory: "4xx",
      failureCategory: "workspace_access_denied",
      userId: "user_1",
      workspaceId: "ws_other",
    });
    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain(apiToken);
    expect(serialized).not.toContain("dev_1");
  });

  it("lists meeting history for an authorized workspace without transcript content", async () => {
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    const port = await startServer();

    const response = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/meetings`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      workspace_id: "ws_1",
      meetings: [
        {
          meeting_id: "sess_ws_1",
          workspace_id: "ws_1",
          created_by: "user_1",
          meeting_source: "manual",
          status: "ended",
          started_at: "2026-07-02T00:00:00.000Z",
          ended_at: "2026-07-02T00:10:00.000Z",
          segment_count: 1,
          gap_count: 1,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("follow up with pricing");
  });

  it("filters meeting history by transcript search query without returning transcript content", async () => {
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    const port = await startServer();

    const response = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/meetings?q=pricing`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      workspace_id: "ws_1",
      meetings: [{ meeting_id: "sess_ws_1" }],
    });
    expect(JSON.stringify(body)).not.toContain("follow up with pricing");
  });

  it("returns meeting detail and export for authorized workspace members", async () => {
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    const port = await startServer();

    const detail = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/meetings/sess_ws_1`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      meeting: {
        meeting_id: "sess_ws_1",
        workspace_id: "ws_1",
      },
      transcript: {
        segments: [
          {
            segment_id: "seg_1",
            text: "follow up with pricing",
          },
        ],
        gaps: [
          {
            reason: "user_paused_capture",
          },
        ],
      },
    });

    const exported = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/meetings/sess_ws_1/export?format=markdown`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );

    expect(exported.status).toBe(200);
    const exportBody = await exported.json();
    expect(exportBody).toMatchObject({
      meeting_id: "sess_ws_1",
      workspace_id: "ws_1",
      format: "markdown",
      content_type: "text/markdown",
    });
    expect(exportBody.content).toContain("follow up with pricing");
  });

  it("denies cross-workspace meeting access before repository reads", async () => {
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    const port = await startServer();

    const response = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_2/meetings/sess_ws_2`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "workspace_access_denied" });
  });

  it("returns not found and invalid export errors without transcript content", async () => {
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    const port = await startServer();

    const missing = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/meetings/missing`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "meeting_not_found" });

    const invalidExport = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/meetings/sess_ws_1/export?format=pdf`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );
    expect(invalidExport.status).toBe(400);
    expect(await invalidExport.json()).toEqual({ error: "invalid_request" });
  });

  it("deletes meetings through a workspace-scoped route", async () => {
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "admin" }],
    });
    const deleteRepository = new InMemoryMeetingReviewRepository([
      {
        meeting: {
          meeting_id: "sess_delete",
          workspace_id: "ws_1",
          created_by: "user_1",
          meeting_source: "manual",
          status: "ended",
          segment_count: 0,
          gap_count: 0,
        },
      },
    ]);
    handle = createHttpServer({
      env: defaultEnv,
      now: () => fixedNow,
      meetingRepository: deleteRepository,
    });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = getPort(handle);

    const deleted = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/meetings/sess_delete`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );

    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({
      meeting_id: "sess_delete",
      workspace_id: "ws_1",
      deleted: true,
    });

    await expect(deleteRepository.getMeetingDetail("ws_1", "sess_delete")).resolves.toBeUndefined();
  });

  it("allows members to delete only meetings they created", async () => {
    const memberToken = issueApiToken({
      userId: "user_member",
      memberships: [{ userId: "user_member", workspaceId: "ws_1", role: "member" }],
    });
    const deleteRepository = new InMemoryMeetingReviewRepository([
      {
        meeting: {
          meeting_id: "sess_own",
          workspace_id: "ws_1",
          created_by: "user_member",
          meeting_source: "manual",
          status: "ended",
          segment_count: 0,
          gap_count: 0,
        },
      },
      {
        meeting: {
          meeting_id: "sess_other_creator",
          workspace_id: "ws_1",
          created_by: "user_other",
          meeting_source: "manual",
          status: "ended",
          segment_count: 0,
          gap_count: 0,
        },
      },
    ]);
    handle = createHttpServer({
      env: defaultEnv,
      now: () => fixedNow,
      meetingRepository: deleteRepository,
    });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = getPort(handle);

    const forbidden = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/meetings/sess_other_creator`,
      { method: "DELETE", headers: { Authorization: `Bearer ${memberToken}` } },
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "meeting_delete_forbidden" });

    const own = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/meetings/sess_own`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(own.status).toBe(200);
  });

  it("uploads, lists, details, and searches knowledge documents for authorized workspace members", async () => {
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    const port = await startServer();

    const uploaded = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({
        title: "Security FAQ",
        source: "manual_upload",
        text: "Provider credentials stay server-side.",
      }),
    });

    expect(uploaded.status).toBe(201);
    const uploadBody = await uploaded.json();
    expect(uploadBody).toMatchObject({
      document: {
        document_id: "doc_api_doc",
        workspace_id: "ws_1",
        title: "Security FAQ",
        chunk_count: 1,
      },
      chunks: [
        {
          chunk_id: "chunk_api_chunk",
          text: "Provider credentials stay server-side.",
        },
      ],
    });

    const list = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/documents`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody).toMatchObject({
      workspace_id: "ws_1",
      documents: [{ document_id: "doc_api_doc", title: "Security FAQ" }],
    });
    expect(JSON.stringify(listBody)).not.toContain("Provider credentials");

    const detail = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/documents/doc_api_doc`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      document: { document_id: "doc_api_doc" },
      chunks: [{ text: "Provider credentials stay server-side." }],
    });

    const search = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/knowledge/search?q=credentials&top_k=1`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );
    expect(search.status).toBe(200);
    expect(await search.json()).toMatchObject({
      workspace_id: "ws_1",
      query: "credentials",
      results: [
        {
          document_id: "doc_api_doc",
          title: "Security FAQ",
          source: "manual_upload",
          chunk_id: "chunk_api_chunk",
        },
      ],
    });
  });

  it("does not expose restricted knowledge metadata or content to an unmatched member", async () => {
    const restrictedRepository = new InMemoryKnowledgeRepository({
      seeds: [
        {
          document: {
            document_id: "doc_restricted_api",
            workspace_id: "ws_1",
            title: "Restricted Pipeline",
            source: "manual_upload",
            status: "active",
            chunk_count: 1,
            created_by: "user_creator",
          },
          chunks: [
            {
              chunk_id: "chunk_restricted_api",
              document_id: "doc_restricted_api",
              chunk_index: 0,
              text: "Confidential pipeline forecast",
              permission_tags: ["sales"],
            },
          ],
        },
      ],
    });
    handle = createHttpServer({
      env: defaultEnv,
      now: () => fixedNow,
      meetingRepository,
      knowledgeRepository: restrictedRepository,
    });
    await new Promise<void>((resolve) => {
      handle!.server.listen(0, "127.0.0.1", () => resolve());
    });
    const port = getPort(handle);
    const memberToken = issueApiToken({
      userId: "user_other",
      memberships: [{ userId: "user_other", workspaceId: "ws_1", role: "member" }],
    });

    const list = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/documents`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(await list.json()).toEqual({ workspace_id: "ws_1", documents: [] });

    const detail = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/documents/doc_restricted_api`,
      { headers: { Authorization: `Bearer ${memberToken}` } },
    );
    expect(detail.status).toBe(404);

    const search = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/knowledge/search?q=forecast`,
      { headers: { Authorization: `Bearer ${memberToken}` } },
    );
    expect(await search.json()).toEqual({ workspace_id: "ws_1", query: "forecast", results: [] });
  });

  it("denies cross-workspace knowledge access before repository reads", async () => {
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    const port = await startServer();

    const response = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_2/documents/doc_ws_2`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "workspace_access_denied" });
  });

  it("returns stable knowledge errors without document text", async () => {
    const apiToken = issueApiToken({
      userId: "user_1",
      memberships: [{ userId: "user_1", workspaceId: "ws_1", role: "member" }],
    });
    const port = await startServer();

    const invalidUpload = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({ title: "Invalid", source: "manual_upload", text: "" }),
    });
    expect(invalidUpload.status).toBe(400);
    expect(await invalidUpload.json()).toEqual({ error: "invalid_request" });

    const missing = await fetch(`http://127.0.0.1:${port}/v1/workspaces/ws_1/documents/missing`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "document_not_found" });

    const badSearch = await fetch(
      `http://127.0.0.1:${port}/v1/workspaces/ws_1/knowledge/search?q=`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    );
    expect(badSearch.status).toBe(400);
    expect(await badSearch.json()).toEqual({ error: "invalid_request" });
  });
});

function createSequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `extra_${index}`;
}
