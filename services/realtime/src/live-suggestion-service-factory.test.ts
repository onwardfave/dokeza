import { describe, expect, it } from "vitest";
import { parseConfig, type DokezaConfig } from "@dokeza/config";
import { createLiveSuggestionServiceFromConfig } from "./live-suggestion-service-factory.js";

function requireConfig(result: ReturnType<typeof parseConfig>): DokezaConfig {
  expect(result.ok).toBe(true);
  if (!result.config) {
    throw new Error("Expected config");
  }

  return result.config;
}

async function collectSuggestionModel(
  service: ReturnType<typeof createLiveSuggestionServiceFromConfig>,
): Promise<string | undefined> {
  let model: string | undefined;
  for await (const event of service.streamLiveSuggestion({
    workspaceId: "ws_a",
    sessionId: "sess_a",
    requestId: "sreq_a",
    kind: "answer_question",
    includeSources: false,
    transcriptSegments: [
      {
        segmentId: "seg_a",
        speaker: "remote",
        text: "Can you explain onboarding?",
        startMs: 0,
        endMs: 1200,
        final: true,
      },
    ],
  })) {
    if (event.type === "complete") {
      model = event.model;
    }
  }

  return model;
}

describe("createLiveSuggestionServiceFromConfig", () => {
  it("uses deterministic live suggestions for local config without provider credentials", async () => {
    const config = requireConfig(parseConfig({}, "realtime"));

    const service = createLiveSuggestionServiceFromConfig(config);

    await expect(collectSuggestionModel(service)).resolves.toBe("deterministic-live-v1");
  });

  it("uses OpenAI Responses streaming when configured with server-side credentials", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const config = requireConfig(
      parseConfig(
        {
          DOKEZA_LLM_PROVIDER: "openai",
          OPENAI_API_KEY: "sk-test-secret",
          OPENAI_BASE_URL: "https://llm.example.com/v1",
          OPENAI_MODEL: "gpt-live-test",
          OPENAI_TIMEOUT_MS: "9000",
        },
        "realtime",
      ),
    );
    const service = createLiveSuggestionServiceFromConfig(config, {
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"response.output_text.delta","delta":"Configured"}\n\n' +
                  'data: {"type":"response.completed"}\n\n',
              ),
            );
            controller.close();
          },
        });
        return new Response(body, { status: 200 });
      },
    });

    await expect(collectSuggestionModel(service)).resolves.toBe("gpt-live-test");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://llm.example.com/v1/responses");
    expect(requests[0]?.init.headers).toMatchObject({
      Authorization: "Bearer sk-test-secret",
      "Content-Type": "application/json",
    });
    expect(String(requests[0]?.init.body)).toContain('"store":false');
    expect(String(requests[0]?.init.body)).not.toContain("sk-test-secret");
  });

  it("uses OpenAI-compatible chat completions (e.g. NVIDIA) when provider is openai_chat", async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const config = requireConfig(
      parseConfig(
        {
          DOKEZA_LLM_PROVIDER: "openai_chat",
          OPENAI_API_KEY: "nvapi-test-secret",
          OPENAI_BASE_URL: "https://integrate.api.nvidia.com/v1",
          OPENAI_MODEL: "meta/llama-3.1-8b-instruct",
          OPENAI_TIMEOUT_MS: "9000",
        },
        "realtime",
      ),
    );
    const service = createLiveSuggestionServiceFromConfig(config, {
      fetchFn: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"choices":[{"delta":{"content":"Configured"},"finish_reason":null}]}\n\n' +
                  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
                  "data: [DONE]\n\n",
              ),
            );
            controller.close();
          },
        });
        return new Response(body, { status: 200 });
      },
    });

    await expect(collectSuggestionModel(service)).resolves.toBe("meta/llama-3.1-8b-instruct");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(requests[0]?.init.headers).toMatchObject({
      Authorization: "Bearer nvapi-test-secret",
      "Content-Type": "application/json",
    });
    expect(String(requests[0]?.init.body)).toContain('"messages"');
    expect(String(requests[0]?.init.body)).not.toContain("nvapi-test-secret");
  });

  it("fails closed if OpenAI live suggestion credentials are unavailable", () => {
    const localConfig = requireConfig(parseConfig({}, "realtime"));
    const config: DokezaConfig = {
      ...localConfig,
      environment: "production",
      providers: {
        ...localConfig.providers,
        llm: {
          provider: "openai",
          openai: {
            baseUrl: "https://api.openai.com/v1",
            model: "gpt-live-test",
            timeoutMs: 10000,
          },
        },
      },
    };

    expect(() => createLiveSuggestionServiceFromConfig(config)).toThrow(
      "OPENAI_API_KEY is required for live suggestions.",
    );
  });
});
