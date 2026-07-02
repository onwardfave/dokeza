import { describe, expect, it } from "vitest";
import {
  requestDevelopmentApiToken,
  requestRealtimeSessionToken,
  type AuthApiFetch,
} from "./authApiClient.js";

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  };
}

describe("authApiClient", () => {
  it("requests a development API token without exposing it in errors", async () => {
    const calls: Array<{ input: string; body?: string }> = [];
    const fetcher: AuthApiFetch = async (input, init) => {
      calls.push({ input, ...(init?.body === undefined ? {} : { body: init.body }) });
      return okJson({
        token: "api_secret_token",
        expires_at: "2026-07-02T01:00:00.000Z",
        user_id: "user_dev",
      });
    };

    await expect(
      requestDevelopmentApiToken({
        apiBaseUrl: "http://127.0.0.1:3000/",
        workspaceId: "ws_dev",
        fetcher,
      }),
    ).resolves.toEqual({
      token: "api_secret_token",
      expiresAt: "2026-07-02T01:00:00.000Z",
      userId: "user_dev",
    });
    expect(calls).toEqual([
      {
        input: "http://127.0.0.1:3000/v1/dev/auth/token",
        body: JSON.stringify({ workspace_id: "ws_dev" }),
      },
    ]);
  });

  it("exchanges an API token for a workspace-scoped realtime token", async () => {
    const calls: Array<{ input: string; auth?: string; body?: string }> = [];
    const fetcher: AuthApiFetch = async (input, init) => {
      calls.push({
        input,
        ...(init?.headers?.Authorization === undefined
          ? {}
          : { auth: init.headers.Authorization }),
        ...(init?.body === undefined ? {} : { body: init.body }),
      });
      return okJson({
        token: "realtime_secret_token",
        expires_at: "2026-07-02T00:05:00.000Z",
        workspace_id: "ws_dev",
      });
    };

    await expect(
      requestRealtimeSessionToken({
        apiBaseUrl: "http://127.0.0.1:3000",
        apiToken: "api_secret_token",
        workspaceId: "ws_dev",
        deviceId: "dev_desktop_preview",
        fetcher,
      }),
    ).resolves.toEqual({
      token: "realtime_secret_token",
      expiresAt: "2026-07-02T00:05:00.000Z",
      workspaceId: "ws_dev",
    });
    expect(calls).toEqual([
      {
        input: "http://127.0.0.1:3000/v1/realtime/token",
        auth: "Bearer api_secret_token",
        body: JSON.stringify({
          workspace_id: "ws_dev",
          device_id: "dev_desktop_preview",
        }),
      },
    ]);
  });

  it("throws sanitized failures for unsuccessful responses and invalid bodies", async () => {
    const failingFetcher: AuthApiFetch = async () => ({
      ok: false,
      status: 403,
      async json() {
        return { error: "workspace_access_denied", token: "do_not_leak" };
      },
    });

    await expect(
      requestRealtimeSessionToken({
        apiBaseUrl: "http://127.0.0.1:3000",
        apiToken: "api_secret_token",
        workspaceId: "ws_other",
        deviceId: "dev_desktop_preview",
        fetcher: failingFetcher,
      }),
    ).rejects.toThrow("auth_api_realtime_token_failed:403");

    const invalidBodyFetcher: AuthApiFetch = async () => okJson({ token: "missing_fields" });
    await expect(
      requestDevelopmentApiToken({
        apiBaseUrl: "http://127.0.0.1:3000",
        workspaceId: "ws_dev",
        fetcher: invalidBodyFetcher,
      }),
    ).rejects.toThrow("auth_api_invalid_response");
  });
});
