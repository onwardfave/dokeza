/**
 * Alpha.5a partial real-provider smoke harness.
 *
 * Exercises the provider-adapter boundaries that have only ever been verified
 * against fakes: real OpenAI suggestion generation (with latency measured
 * against the 3s NFR-001 target), real OpenAI embeddings through retrieval,
 * and real Deepgram connectivity/framing.
 *
 * It deliberately does NOT cover the Auth0 browser sign-in or physical
 * microphone capture through the desktop GUI — those require a human and stay
 * in the manual checklist (docs/testing/alpha5a-smoke-test-checklist.md). It
 * also bypasses the realtime WebSocket orchestration, which is already
 * fake-tested; the untested surface is the provider calls themselves.
 *
 * Run (with real, throwaway keys set at User scope):
 *   pnpm --filter @dokeza/realtime build
 *   pnpm --filter @dokeza/realtime exec tsx scripts/alpha5a-provider-smoke.ts
 *
 * All input is synthetic and non-sensitive. Output is content-light: latency,
 * counts, provider/model, and lengths — no keys, and no model output beyond a
 * short sanity length.
 */
import { parseConfig, type DokezaConfig } from "@dokeza/config";
import type { LiveSuggestionInput } from "@dokeza/ai-orchestrator";
import {
  createKnowledgeEmbeddingProviderFromConfig,
  InMemoryKnowledgeRepository,
} from "@dokeza/knowledge";
import { createLiveSuggestionServiceFromConfig } from "../src/live-suggestion-service-factory.js";
import { createSttAdapterFromConfig } from "../src/stt-adapter-factory.js";
import { supportsSttSessions } from "../src/stt-adapter.js";

type StepStatus = "PASS" | "FAIL" | "SKIP";

interface StepResult {
  name: string;
  status: StepStatus;
  detail: string;
}

const NFR_001_TARGET_MS = 3000;
const results: StepResult[] = [];

function record(name: string, status: StepStatus, detail: string): void {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name} — ${detail}`);
}

function loadConfig(): DokezaConfig {
  const parsed = parseConfig(process.env, "alpha5a-smoke");
  if (!parsed.ok || parsed.config === undefined) {
    console.error("Invalid configuration for the smoke harness:");
    for (const error of parsed.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(2);
  }
  return parsed.config;
}

function synthPcmChunk(durationMs: number, freqHz = 440, sampleRateHz = 16000): Uint8Array {
  const sampleCount = Math.floor((sampleRateHz * durationMs) / 1000);
  const buffer = Buffer.alloc(sampleCount * 2);
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * freqHz * i) / sampleRateHz) * 8000);
    buffer.writeInt16LE(sample, i * 2);
  }
  return new Uint8Array(buffer);
}

async function checkOpenAiSuggestion(config: DokezaConfig): Promise<void> {
  const name = "OpenAI live suggestion (NFR-001 latency)";
  if (config.providers.llm.provider !== "openai") {
    record(
      name,
      "SKIP",
      `llm provider is '${config.providers.llm.provider}'; set DOKEZA_LLM_PROVIDER=openai + OPENAI_API_KEY`,
    );
    return;
  }

  const service = createLiveSuggestionServiceFromConfig(config);
  const input: LiveSuggestionInput = {
    workspaceId: "ws_smoke",
    sessionId: "sess_smoke",
    requestId: `req_${Date.now()}`,
    kind: "answer_question",
    includeSources: false,
    userPrompt: "Answer the prospect's question concisely.",
    transcriptSegments: [
      {
        segmentId: "seg_1",
        speaker: "remote",
        text: "What is your pricing for the enterprise plan, and how does onboarding usually work?",
        startMs: 0,
        endMs: 4000,
        final: true,
      },
    ],
  };

  const startedAt = Date.now();
  let firstTokenAt: number | undefined;
  let tokenCount = 0;
  let completeLength = 0;
  let model = "unknown";

  try {
    for await (const event of service.streamLiveSuggestion(input)) {
      if (event.type === "token") {
        firstTokenAt ??= Date.now();
        tokenCount += 1;
      } else {
        completeLength = event.content.length;
        model = event.model;
      }
    }
  } catch (error) {
    record(name, "FAIL", `provider error: ${errorLabel(error)}`);
    return;
  }

  const completeMs = Date.now() - startedAt;
  const firstTokenMs = firstTokenAt === undefined ? completeMs : firstTokenAt - startedAt;
  const withinTarget = completeMs <= NFR_001_TARGET_MS;
  record(
    name,
    completeLength > 0 ? "PASS" : "FAIL",
    `model=${model} firstToken=${firstTokenMs}ms complete=${completeMs}ms (target ${NFR_001_TARGET_MS}ms → ${withinTarget ? "within" : "OVER"}) tokens=${tokenCount} outputLen=${completeLength}`,
  );
}

async function checkOpenAiEmbeddingsRetrieval(config: DokezaConfig): Promise<void> {
  const name = "OpenAI embeddings → retrieval";
  if (config.providers.embeddings.provider !== "openai") {
    record(
      name,
      "SKIP",
      `embeddings provider is '${config.providers.embeddings.provider}'; set DOKEZA_EMBEDDING_PROVIDER=openai + OPENAI_API_KEY`,
    );
    return;
  }

  let embeddingProvider;
  try {
    embeddingProvider = createKnowledgeEmbeddingProviderFromConfig(config);
  } catch (error) {
    record(name, "FAIL", `embedding provider construction failed: ${errorLabel(error)}`);
    return;
  }

  const repo = new InMemoryKnowledgeRepository({ embeddingProvider });
  const startedAt = Date.now();
  try {
    const upload = await repo.uploadDocument({
      workspaceId: "ws_smoke",
      actorUserId: "user_smoke",
      title: "Enterprise onboarding guide",
      source: "smoke",
      text: "Enterprise onboarding includes a dedicated success manager, SSO setup, and a 30-day pilot. Pricing for the enterprise plan is custom and volume-based.",
    });
    const search = await repo.search({
      workspaceId: "ws_smoke",
      query: "how does enterprise onboarding and pricing work",
      topK: 3,
    });
    const elapsed = Date.now() - startedAt;
    const hit = search.results.some((result) => result.document_id === upload.document.document_id);
    record(
      name,
      hit ? "PASS" : "FAIL",
      `provider=${embeddingProvider.provider} model=${embeddingProvider.model} dims=${embeddingProvider.dimensions} chunks=${upload.chunks.length} results=${search.results.length} retrievedUploaded=${hit} elapsed=${elapsed}ms`,
    );
  } catch (error) {
    record(name, "FAIL", `embedding/retrieval error: ${errorLabel(error)}`);
  }
}

async function checkDeepgramConnectivity(config: DokezaConfig): Promise<void> {
  const name = "Deepgram connectivity/framing";
  const apiKey = config.providers.stt.deepgram.apiKey;
  if (apiKey === undefined || apiKey.length === 0) {
    record(name, "SKIP", "no DEEPGRAM_API_KEY; STT falls back to the deterministic adapter");
    return;
  }

  const adapter = createSttAdapterFromConfig(config);
  const startedAt = Date.now();
  const meta = {
    chunk_id: "chunk_0",
    chunk_index: 0,
    stream: "microphone",
    codec: "pcm_s16le",
    sample_rate_hz: 16000,
    channels: 1,
    duration_ms: 100,
    timestamp_ms: 0,
  } as unknown as Parameters<typeof adapter.transcribeChunk>[0]["meta"];

  try {
    let eventCount = 0;
    if (supportsSttSessions(adapter)) {
      const events: unknown[] = [];
      const session = await adapter.startSession({
        sessionId: "sess_smoke",
        workspaceId: "ws_smoke",
        emitTranscriptEvents: (evts) => events.push(...evts),
        emitError: () => undefined,
      });
      for (let i = 0; i < 5; i += 1) {
        await session.transcribeChunk({
          sessionId: "sess_smoke",
          workspaceId: "ws_smoke",
          meta: { ...meta, chunk_index: i, chunk_id: `chunk_${i}`, timestamp_ms: i * 100 },
          bytes: synthPcmChunk(100),
        });
      }
      await session.close("session.end");
      eventCount = events.length;
    } else {
      const result = await adapter.transcribeChunk({
        sessionId: "sess_smoke",
        workspaceId: "ws_smoke",
        meta,
        bytes: synthPcmChunk(100),
      });
      if ("error" in result) {
        record(name, "FAIL", `provider error code=${result.error.code}`);
        return;
      }
      eventCount = result.events.length;
    }
    const elapsed = Date.now() - startedAt;
    record(
      name,
      "PASS",
      `connected+authed; sent synthetic PCM; transcriptEvents=${eventCount} elapsed=${elapsed}ms (empty transcript expected for a tone — this validates auth/framing, not recognition)`,
    );
  } catch (error) {
    record(name, "FAIL", `connection/transport error: ${errorLabel(error)}`);
  }
}

function errorLabel(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

async function main(): Promise<void> {
  const config = loadConfig();
  console.log(
    `Resolved providers → stt=${config.providers.stt.provider}(key=${config.providers.stt.deepgram.apiKey ? "set" : "unset"}) llm=${config.providers.llm.provider} embeddings=${config.providers.embeddings.provider} env=${config.environment}`,
  );
  console.log("---");

  await checkOpenAiSuggestion(config);
  await checkOpenAiEmbeddingsRetrieval(config);
  await checkDeepgramConnectivity(config);

  console.log("---");
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  const passed = results.filter((r) => r.status === "PASS").length;
  console.log(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
  if (skipped > 0 && passed === 0) {
    console.log("Everything skipped — provider keys/selectors are not set. See the checklist.");
  }
  process.exit(failed > 0 ? 1 : 0);
}

void main();
