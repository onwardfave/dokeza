import { describe, expect, it } from "vitest";
import {
  parseLoopbackRedirect,
  waitForHostedAuthCallback,
  type HostedAuthCallbackInvoke,
} from "./hostedAuthCallback.js";

describe("hostedAuthCallback", () => {
  it("maps callback listener requests to the native command", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const invoke: HostedAuthCallbackInvoke = async <T>(
      command: string,
      args?: Record<string, unknown>,
    ) => {
      calls.push({ command, ...(args === undefined ? {} : { args }) });
      return {
        callback_url: "http://127.0.0.1:57619/auth/callback?code=c&state=state_secret",
      } as T;
    };

    await expect(
      waitForHostedAuthCallback(
        {
          port: 57619,
          path: "/auth/callback",
          state: "state_secret",
          timeoutMs: 60_000,
        },
        invoke,
      ),
    ).resolves.toBe("http://127.0.0.1:57619/auth/callback?code=c&state=state_secret");

    expect(calls).toEqual([
      {
        command: "wait_for_hosted_auth_callback",
        args: {
          request: {
            port: 57619,
            path: "/auth/callback",
            state: "state_secret",
            timeout_ms: 60_000,
          },
        },
      },
    ]);
  });

  it("rejects invalid native callback responses", async () => {
    const invoke: HostedAuthCallbackInvoke = async <T>() => ({ callback_url: "" }) as T;

    await expect(
      waitForHostedAuthCallback(
        {
          port: 57619,
          path: "/auth/callback",
          state: "state_secret",
          timeoutMs: 60_000,
        },
        invoke,
      ),
    ).rejects.toThrow("hosted_auth_callback_invalid_response");
  });

  it("parses only exact localhost loopback redirects", () => {
    expect(parseLoopbackRedirect("http://127.0.0.1:57619/auth/callback")).toEqual({
      port: 57619,
      path: "/auth/callback",
    });

    expect(() => parseLoopbackRedirect("https://example.com/auth/callback")).toThrow(
      "hosted_auth_callback_invalid_redirect",
    );
  });
});
