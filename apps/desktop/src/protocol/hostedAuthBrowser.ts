import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface HostedAuthBrowserRuntime {
  isNative(): boolean;
  openNative(url: string): Promise<void>;
  openBrowser(url: string): unknown | null;
}

const defaultRuntime: HostedAuthBrowserRuntime = {
  isNative: isTauri,
  openNative: openUrl,
  openBrowser: (url) => globalThis.open(url, "_blank", "noopener,noreferrer"),
};

export async function openHostedAuthUrl(
  authorizeUrl: string,
  runtime: HostedAuthBrowserRuntime = defaultRuntime,
): Promise<void> {
  if (!isHttpsUrl(authorizeUrl)) {
    throw new Error("hosted_auth_browser_url_rejected");
  }

  try {
    if (runtime.isNative()) {
      await runtime.openNative(authorizeUrl);
      return;
    }

    if (runtime.openBrowser(authorizeUrl) === null) {
      throw new Error("browser_open_rejected");
    }
  } catch {
    throw new Error("hosted_auth_browser_open_failed");
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
