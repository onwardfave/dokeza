import { describe, expect, it } from "vitest";
import { parseConfig } from "./index.js";

describe("parseConfig", () => {
  it("uses documented initial provider and retention defaults", () => {
    const result = parseConfig({}, "realtime");

    expect(result.ok).toBe(true);
    expect(result.config?.providers).toEqual({
      stt: "deepgram",
      llm: "openai",
      embeddings: "openai"
    });
    expect(result.config?.retentionDefaults).toEqual({
      individual: "7_days",
      team: "30_days",
      enterprise: "30_days"
    });
  });

  it("rejects invalid ports without exposing environment values in errors", () => {
    const result = parseConfig({ PORT: "not-a-port" }, "api");

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).not.toContain("not-a-port");
  });
});
