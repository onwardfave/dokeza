import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export interface StoredApiSession {
  token: string;
  expiresAt: string;
  userId: string;
  workspaceId: string;
  providerRefreshToken?: string;
  providerDomain?: string;
  providerClientId?: string;
  providerAudience?: string;
}

export interface SecureTokenStorageReport {
  status: "saved" | "cleared";
}

export type SecureTokenStorageInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

function toNativeSession(session: StoredApiSession): Record<string, string> {
  return {
    token: session.token,
    expires_at: session.expiresAt,
    user_id: session.userId,
    workspace_id: session.workspaceId,
    ...(session.providerRefreshToken === undefined
      ? {}
      : { provider_refresh_token: session.providerRefreshToken }),
    ...(session.providerDomain === undefined ? {} : { provider_domain: session.providerDomain }),
    ...(session.providerClientId === undefined
      ? {}
      : { provider_client_id: session.providerClientId }),
    ...(session.providerAudience === undefined
      ? {}
      : { provider_audience: session.providerAudience }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("secure_token_storage_invalid_response");
  }

  return value;
}

function fromNativeSession(value: unknown): StoredApiSession {
  if (!isRecord(value)) {
    throw new Error("secure_token_storage_invalid_response");
  }

  return {
    token: readString(value.token),
    expiresAt: readString(value.expires_at),
    userId: readString(value.user_id),
    workspaceId: readString(value.workspace_id),
    ...readOptionalStringField(value, "provider_refresh_token", "providerRefreshToken"),
    ...readOptionalStringField(value, "provider_domain", "providerDomain"),
    ...readOptionalStringField(value, "provider_client_id", "providerClientId"),
    ...readOptionalStringField(value, "provider_audience", "providerAudience"),
  };
}

function readOptionalStringField(
  value: Record<string, unknown>,
  nativeField: string,
  outputField: "providerRefreshToken" | "providerDomain" | "providerClientId" | "providerAudience",
): Partial<StoredApiSession> {
  const nativeValue = value[nativeField];
  if (nativeValue === undefined) {
    return {};
  }

  if (typeof nativeValue !== "string" || nativeValue.trim().length === 0) {
    throw new Error("secure_token_storage_invalid_response");
  }

  return { [outputField]: nativeValue };
}

function fromReport(value: unknown): SecureTokenStorageReport {
  if (!isRecord(value) || (value.status !== "saved" && value.status !== "cleared")) {
    throw new Error("secure_token_storage_invalid_response");
  }

  return { status: value.status };
}

export async function saveApiSession(
  session: StoredApiSession,
  invoke: SecureTokenStorageInvoke = tauriInvoke,
): Promise<SecureTokenStorageReport> {
  const report = await invoke<unknown>("save_api_session", { session: toNativeSession(session) });
  return fromReport(report);
}

export async function loadApiSession(
  invoke: SecureTokenStorageInvoke = tauriInvoke,
): Promise<StoredApiSession | null> {
  const session = await invoke<unknown>("load_api_session");
  return session === null ? null : fromNativeSession(session);
}

export async function clearApiSession(
  invoke: SecureTokenStorageInvoke = tauriInvoke,
): Promise<SecureTokenStorageReport> {
  const report = await invoke<unknown>("clear_api_session");
  return fromReport(report);
}
