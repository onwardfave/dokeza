import { describe, expect, it } from "vitest";
import { buildDesktopSecurityConfig } from "./desktopSecurityConfig.js";

describe("buildDesktopSecurityConfig", () => {
  it("generates a production CSP from exact configured origins", () => {
    const config = buildDesktopSecurityConfig("production", {
      apiEndpoint: "https://api.dokeza.example/v1",
      realtimeEndpoint: "wss://realtime.dokeza.example/realtime",
      auth0Domain: "https://login.dokeza.example",
    });

    expect(config.app.security.csp).toContain(
      "connect-src 'self' https://api.dokeza.example wss://realtime.dokeza.example https://login.dokeza.example",
    );
    expect(config.app.security.csp).not.toContain("localhost:*");
    expect(config.app.security.csp).not.toContain("127.0.0.1");
  });

  it("rejects cleartext production service endpoints", () => {
    expect(() =>
      buildDesktopSecurityConfig("production", {
        apiEndpoint: "http://api.dokeza.example",
        realtimeEndpoint: "ws://realtime.dokeza.example/realtime",
        auth0Domain: "https://login.dokeza.example",
      }),
    ).toThrow("desktop_security_invalid_production_endpoint");
  });

  it("allows loopback cleartext endpoints only in local mode", () => {
    const config = buildDesktopSecurityConfig("local", {
      apiEndpoint: "http://127.0.0.1:3000",
      realtimeEndpoint: "ws://localhost:3001/realtime",
      auth0Domain: "https://dokeza-alpha.us.auth0.com",
    });

    expect(config.app.security.csp).toContain("http://127.0.0.1:3000");
    expect(config.app.security.csp).toContain("ws://localhost:3001");
  });

  it("rejects non-loopback cleartext endpoints in local mode", () => {
    expect(() =>
      buildDesktopSecurityConfig("local", {
        apiEndpoint: "http://api.internal.example:3000",
        realtimeEndpoint: "ws://127.0.0.1:3001/realtime",
        auth0Domain: "https://dokeza-alpha.us.auth0.com",
      }),
    ).toThrow("desktop_security_cleartext_not_loopback");
  });
});
