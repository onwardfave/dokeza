import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildDesktopSecurityConfig,
  type DesktopSecurityMode,
} from "../src/security/desktopSecurityConfig.js";

const mode = process.argv[2] as DesktopSecurityMode | undefined;
if (mode !== "local" && mode !== "production") {
  throw new Error("usage: write-tauri-security-config.ts <local|production>");
}

const required = (name: string, localDefault?: string): string => {
  const value = process.env[name]?.trim() || (mode === "local" ? localDefault : undefined);
  if (value === undefined || value.length === 0) {
    throw new Error(`desktop_security_missing_${name.toLowerCase()}`);
  }
  return value;
};

const config = buildDesktopSecurityConfig(mode, {
  apiEndpoint: required("VITE_DOKEZA_API_ENDPOINT", "http://127.0.0.1:3000"),
  realtimeEndpoint: required("VITE_DOKEZA_REALTIME_ENDPOINT", "ws://127.0.0.1:3001/realtime"),
  auth0Domain: required("VITE_DOKEZA_AUTH0_DOMAIN", "https://dokeza-alpha.us.auth0.com"),
});

const outputPath = resolve("src-tauri/tauri.security.generated.json");
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
process.stdout.write(`Wrote ${outputPath} for ${mode} mode.\n`);
