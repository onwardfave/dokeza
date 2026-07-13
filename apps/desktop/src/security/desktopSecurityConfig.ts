export type DesktopSecurityMode = "local" | "production";

export interface DesktopSecurityEndpoints {
  apiEndpoint: string;
  realtimeEndpoint: string;
  auth0Domain: string;
}

export interface GeneratedDesktopSecurityConfig {
  app: {
    security: {
      csp: string;
    };
  };
}

export function buildDesktopSecurityConfig(
  mode: DesktopSecurityMode,
  endpoints: DesktopSecurityEndpoints,
): GeneratedDesktopSecurityConfig {
  const api = validatedUrl(endpoints.apiEndpoint, "api");
  const realtime = validatedUrl(endpoints.realtimeEndpoint, "realtime");
  const auth0 = validatedUrl(endpoints.auth0Domain, "auth0");

  if (mode === "production") {
    if (api.protocol !== "https:" || realtime.protocol !== "wss:" || auth0.protocol !== "https:") {
      throw new Error("desktop_security_invalid_production_endpoint");
    }
  } else {
    validateLocalProtocol(api, ["http:", "https:"]);
    validateLocalProtocol(realtime, ["ws:", "wss:"]);
    if (auth0.protocol !== "https:") {
      throw new Error("desktop_security_auth_endpoint_requires_https");
    }
  }

  const connectSources = unique([api.origin, realtime.origin, auth0.origin]);
  return {
    app: {
      security: {
        csp: [
          "default-src 'self'",
          `connect-src 'self' ${connectSources.join(" ")}`,
          "img-src 'self' asset: https://asset.localhost",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "object-src 'none'",
          "base-uri 'none'",
          "frame-ancestors 'none'",
        ].join("; "),
      },
    },
  };
}

function validatedUrl(value: string, endpoint: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`desktop_security_invalid_${endpoint}_endpoint`);
  }
}

function validateLocalProtocol(url: URL, allowedProtocols: string[]): void {
  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error("desktop_security_invalid_local_endpoint");
  }

  if (
    (url.protocol === "http:" || url.protocol === "ws:") &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost" &&
    url.hostname !== "[::1]"
  ) {
    throw new Error("desktop_security_cleartext_not_loopback");
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
