import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export interface HostedAuthCallbackRequest {
  port: number;
  path: string;
  state: string;
  timeoutMs: number;
}

export type HostedAuthCallbackInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

interface NativeHostedAuthCallbackResponse {
  callback_url?: unknown;
}

export async function waitForHostedAuthCallback(
  request: HostedAuthCallbackRequest,
  invoke: HostedAuthCallbackInvoke = tauriInvoke,
): Promise<string> {
  const response = await invoke<NativeHostedAuthCallbackResponse>("wait_for_hosted_auth_callback", {
    request: {
      port: request.port,
      path: request.path,
      state: request.state,
      timeout_ms: request.timeoutMs,
    },
  });

  if (typeof response.callback_url !== "string" || response.callback_url.trim().length === 0) {
    throw new Error("hosted_auth_callback_invalid_response");
  }

  return response.callback_url;
}

export function parseLoopbackRedirect(redirectUri: string): { port: number; path: string } {
  const parsed = new URL(redirectUri);
  if (parsed.hostname !== "127.0.0.1" || parsed.protocol !== "http:") {
    throw new Error("hosted_auth_callback_invalid_redirect");
  }

  const port = Number.parseInt(parsed.port, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("hosted_auth_callback_invalid_redirect");
  }

  return { port, path: parsed.pathname };
}
