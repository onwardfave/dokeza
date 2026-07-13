import { describe, expect, it, vi } from "vitest";
import { openHostedAuthUrl, type HostedAuthBrowserRuntime } from "./hostedAuthBrowser.js";

const authorizeUrl =
  "https://dokeza-alpha.us.auth0.com/authorize?client_id=desktop&state=sensitive_state";

function runtime(overrides: Partial<HostedAuthBrowserRuntime>): HostedAuthBrowserRuntime {
  return {
    isNative: () => false,
    openNative: vi.fn(async () => undefined),
    openBrowser: vi.fn(() => ({})),
    ...overrides,
  };
}

describe("openHostedAuthUrl", () => {
  it("uses the Tauri system opener in an installed native runtime", async () => {
    const openNative = vi.fn(async () => undefined);
    const openBrowser = vi.fn(() => ({}));

    await openHostedAuthUrl(
      authorizeUrl,
      runtime({ isNative: () => true, openNative, openBrowser }),
    );

    expect(openNative).toHaveBeenCalledWith(authorizeUrl);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it("keeps an ordinary browser-preview fallback", async () => {
    const openNative = vi.fn(async () => undefined);
    const openBrowser = vi.fn(() => ({}));

    await openHostedAuthUrl(authorizeUrl, runtime({ openNative, openBrowser }));

    expect(openBrowser).toHaveBeenCalledWith(authorizeUrl);
    expect(openNative).not.toHaveBeenCalled();
  });

  it("rejects non-HTTPS authorize URLs before opening either boundary", async () => {
    const boundary = runtime({});

    await expect(
      openHostedAuthUrl("http://auth.example.test/authorize?state=secret", boundary),
    ).rejects.toThrow("hosted_auth_browser_url_rejected");
    expect(boundary.openNative).not.toHaveBeenCalled();
    expect(boundary.openBrowser).not.toHaveBeenCalled();
  });

  it("maps native opener details to a content-free error", async () => {
    await expect(
      openHostedAuthUrl(
        authorizeUrl,
        runtime({
          isNative: () => true,
          openNative: async () => {
            throw new Error(`plugin failed for ${authorizeUrl}`);
          },
        }),
      ),
    ).rejects.toThrow("hosted_auth_browser_open_failed");
  });
});
