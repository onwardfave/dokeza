import { describe, expect, it } from "vitest";
import { parseConfig, type DokezaConfig } from "@dokeza/config";
import { createConfiguredRealtimeServer } from "./configured-server.js";

function requireConfig(result: ReturnType<typeof parseConfig>): DokezaConfig {
  expect(result.ok).toBe(true);
  if (!result.config) {
    throw new Error("Expected config");
  }

  return result.config;
}

async function listen(handle: ReturnType<typeof createConfiguredRealtimeServer>): Promise<void> {
  await new Promise<void>((resolve) => {
    handle.httpServer.listen(0, "127.0.0.1", () => resolve());
  });
}

describe("createConfiguredRealtimeServer", () => {
  it("composes local realtime dependencies without provider credentials", async () => {
    const config = requireConfig(parseConfig({}, "realtime"));

    const handle = createConfiguredRealtimeServer(config);

    await listen(handle);
    expect(handle.wss).toBeDefined();
    await handle.close();
  });

  it("accepts configured OpenAI live suggestion dependencies without calling the provider at startup", async () => {
    const config = requireConfig(
      parseConfig(
        {
          DOKEZA_LLM_PROVIDER: "openai",
          OPENAI_API_KEY: "sk-test-secret",
          OPENAI_MODEL: "gpt-live-test",
        },
        "realtime",
      ),
    );
    let fetchCalled = false;

    const handle = createConfiguredRealtimeServer(config, {
      fetchFn: async () => {
        fetchCalled = true;
        return new Response(null, { status: 500 });
      },
    });

    await listen(handle);
    expect(handle.wss).toBeDefined();
    expect(fetchCalled).toBe(false);
    await handle.close();
  });
});
