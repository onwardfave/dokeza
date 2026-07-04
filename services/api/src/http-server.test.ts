import { describe, expect, it, afterEach } from "vitest";
import { createDokezaAuthTokenService } from "@dokeza/auth";
import type { Actor } from "@dokeza/authz";
import { InMemoryKnowledgeRepository } from "@dokeza/knowledge";
import { createHttpServer, type HttpServerHandle } from "./http-server.js";
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
