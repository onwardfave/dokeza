export interface AuthApiFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type AuthApiFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<AuthApiFetchResponse>;

export interface DevelopmentApiToken {
  token: string;
  expiresAt: string;
  userId: string;
}

export interface RealtimeSessionToken {
  token: string;
  expiresAt: string;
  workspaceId: string;
}

export interface DevelopmentTokenRequest {
  apiBaseUrl: string;
  workspaceId: string;
  userId?: string;
  fetcher?: AuthApiFetch;
}

export interface RealtimeTokenRequest {
  apiBaseUrl: string;
  apiToken: string;
  workspaceId: string;
  deviceId: string;
  fetcher?: AuthApiFetch;
}

function trimBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireStringField(body: unknown, field: string): string {
  if (!isRecord(body) || typeof body[field] !== "string") {
    throw new Error("auth_api_invalid_response");
  }

  return body[field];
}

export async function requestDevelopmentApiToken(
  input: DevelopmentTokenRequest,
): Promise<DevelopmentApiToken> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`${trimBaseUrl(input.apiBaseUrl)}/v1/dev/auth/token`, {
    method: "POST",
    body: JSON.stringify({
      workspace_id: input.workspaceId,
      ...(input.userId === undefined ? {} : { user_id: input.userId }),
    }),
  });

  if (!response.ok) {
    throw new Error(`auth_api_dev_token_failed:${response.status}`);
  }

  const body = await response.json();
  return {
    token: requireStringField(body, "token"),
    expiresAt: requireStringField(body, "expires_at"),
    userId: requireStringField(body, "user_id"),
  };
}

export async function requestRealtimeSessionToken(
  input: RealtimeTokenRequest,
): Promise<RealtimeSessionToken> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(`${trimBaseUrl(input.apiBaseUrl)}/v1/realtime/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiToken}`,
    },
    body: JSON.stringify({
      workspace_id: input.workspaceId,
      device_id: input.deviceId,
    }),
  });

  if (!response.ok) {
    throw new Error(`auth_api_realtime_token_failed:${response.status}`);
  }

  const body = await response.json();
  return {
    token: requireStringField(body, "token"),
    expiresAt: requireStringField(body, "expires_at"),
    workspaceId: requireStringField(body, "workspace_id"),
  };
}
