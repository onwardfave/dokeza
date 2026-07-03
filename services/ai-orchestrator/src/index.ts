import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";

export type SuggestionKind =
  | "answer_question"
  | "summarize_so_far"
  | "suggest_follow_up"
  | "objection_response";

export type ModelProvider = "openai" | "deterministic";

export interface ModelGatewayRequest {
  workspaceId: string;
  task: "live_suggestion" | "post_call_summary" | "embedding";
  promptVersion: string;
  provider: ModelProvider;
}

export interface ModelGatewayRoute {
  provider: ModelProvider;
  externalCallEnabled: boolean;
  telemetry: TelemetryEvent;
}

export interface TranscriptContextSegment {
  segmentId: string;
  speaker: "user" | "remote" | "unknown";
  text: string;
  startMs: number;
  endMs: number;
  final: boolean;
}

export interface PromptTemplate {
  version: string;
  kind: SuggestionKind;
  systemInstruction: string;
  maxOutputChars: number;
}

export interface PromptRegistry {
  getLiveSuggestionPrompt(kind: SuggestionKind): PromptTemplate;
}

export interface LiveSuggestionInput {
  workspaceId: string;
  sessionId: string;
  requestId: string;
  kind: SuggestionKind;
  userPrompt?: string;
  includeSources: boolean;
  transcriptSegments: TranscriptContextSegment[];
  now?: () => number;
}

export interface LiveSuggestionTokenEvent {
  type: "token";
  requestId: string;
  suggestionId: string;
  token: string;
  index: number;
}

export interface LiveSuggestionCompleteEvent {
  type: "complete";
  requestId: string;
  suggestionId: string;
  kind: SuggestionKind;
  content: string;
  sources: Array<{ document_id: string; title: string; chunk_id: string }>;
  confidence: "low" | "medium" | "high";
  promptVersion: string;
  model: string;
  telemetry: TelemetryEvent[];
}

export type LiveSuggestionEvent = LiveSuggestionTokenEvent | LiveSuggestionCompleteEvent;

export interface LiveSuggestionProviderRequest {
  workspaceId: string;
  sessionId: string;
  requestId: string;
  kind: SuggestionKind;
  prompt: PromptTemplate;
  transcriptContext: string;
  userPrompt?: string;
  maxOutputChars: number;
}

export interface LiveSuggestionProviderToken {
  type: "token";
  token: string;
}

export interface LiveSuggestionProviderComplete {
  type: "complete";
  model: string;
  confidence?: "low" | "medium" | "high";
}

export type LiveSuggestionProviderEvent =
  | LiveSuggestionProviderToken
  | LiveSuggestionProviderComplete;

export interface LiveSuggestionProvider {
  provider: ModelProvider;
  externalCallEnabled: boolean;
  streamLiveSuggestion(
    request: LiveSuggestionProviderRequest,
  ): AsyncIterable<LiveSuggestionProviderEvent>;
}

export interface LiveSuggestionServiceOptions {
  promptRegistry?: PromptRegistry;
  provider?: LiveSuggestionProvider;
  maxTranscriptSegments?: number;
  maxTranscriptChars?: number;
}

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly code: "llm_provider_timeout" | "invalid_model_response",
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

const DEFAULT_MAX_TRANSCRIPT_SEGMENTS = 12;
const DEFAULT_MAX_TRANSCRIPT_CHARS = 3000;

const PROMPTS: Record<SuggestionKind, PromptTemplate> = {
  answer_question: {
    version: "live.answer.v1",
    kind: "answer_question",
    systemInstruction:
      "Answer the latest likely customer question in one or two speakable sentences. Be honest when the transcript does not contain enough context.",
    maxOutputChars: 420,
  },
  summarize_so_far: {
    version: "live.summary.v1",
    kind: "summarize_so_far",
    systemInstruction:
      "Summarize the conversation so far in three concise bullets suitable for a live meeting.",
    maxOutputChars: 520,
  },
  suggest_follow_up: {
    version: "live.follow_up.v1",
    kind: "suggest_follow_up",
    systemInstruction:
      "Suggest one useful follow-up question that advances the conversation without sounding scripted.",
    maxOutputChars: 260,
  },
  objection_response: {
    version: "live.objection.v1",
    kind: "objection_response",
    systemInstruction:
      "Suggest a calm objection response that acknowledges the concern and offers one practical next step.",
    maxOutputChars: 420,
  },
};

export class StaticPromptRegistry implements PromptRegistry {
  getLiveSuggestionPrompt(kind: SuggestionKind): PromptTemplate {
    return PROMPTS[kind];
  }
}

export function routeModelRequest(request: ModelGatewayRequest): ModelGatewayRoute {
  return {
    provider: request.provider,
    externalCallEnabled: request.provider !== "deterministic",
    telemetry: createTelemetryEvent("ai.model_route_selected", {
      workspaceId: request.workspaceId,
      task: request.task,
      templateVersion: request.promptVersion,
      provider: request.provider,
    }),
  };
}

export function assembleRollingTranscriptContext(input: {
  segments: TranscriptContextSegment[];
  maxSegments?: number;
  maxChars?: number;
}): string {
  const maxSegments = input.maxSegments ?? DEFAULT_MAX_TRANSCRIPT_SEGMENTS;
  const maxChars = input.maxChars ?? DEFAULT_MAX_TRANSCRIPT_CHARS;
  const finalSegments = input.segments
    .filter((segment) => segment.final && segment.text.trim().length > 0)
    .sort((a, b) => a.endMs - b.endMs)
    .slice(-maxSegments);

  const lines: string[] = [];
  let remainingChars = maxChars;

  for (const segment of [...finalSegments].reverse()) {
    const line = `${segment.speaker}: ${segment.text.trim()}`;
    const lineLength = line.length + 1;
    if (lineLength > remainingChars && lines.length > 0) {
      break;
    }

    lines.unshift(line.slice(0, Math.max(0, remainingChars)));
    remainingChars -= Math.min(lineLength, remainingChars);
    if (remainingChars <= 0) {
      break;
    }
  }

  return lines.join("\n");
}

export class DeterministicLiveSuggestionProvider implements LiveSuggestionProvider {
  readonly provider = "deterministic" as const;
  readonly externalCallEnabled = false;

  async *streamLiveSuggestion(
    request: LiveSuggestionProviderRequest,
  ): AsyncIterable<LiveSuggestionProviderEvent> {
    const content = createDeterministicSuggestion(request).slice(0, request.maxOutputChars);
    const tokens = content.match(/\S+\s*/g) ?? [];
    for (const token of tokens) {
      yield { type: "token", token };
    }
    yield { type: "complete", model: "deterministic-live-v1", confidence: "medium" };
  }
}

export class LiveSuggestionService {
  private readonly promptRegistry: PromptRegistry;
  private readonly provider: LiveSuggestionProvider;
  private readonly maxTranscriptSegments: number;
  private readonly maxTranscriptChars: number;

  constructor(options: LiveSuggestionServiceOptions = {}) {
    this.promptRegistry = options.promptRegistry ?? new StaticPromptRegistry();
    this.provider = options.provider ?? new DeterministicLiveSuggestionProvider();
    this.maxTranscriptSegments = options.maxTranscriptSegments ?? DEFAULT_MAX_TRANSCRIPT_SEGMENTS;
    this.maxTranscriptChars = options.maxTranscriptChars ?? DEFAULT_MAX_TRANSCRIPT_CHARS;
  }

  async *streamLiveSuggestion(input: LiveSuggestionInput): AsyncIterable<LiveSuggestionEvent> {
    const startedAt = input.now?.() ?? Date.now();
    const prompt = this.promptRegistry.getLiveSuggestionPrompt(input.kind);
    const route = routeModelRequest({
      workspaceId: input.workspaceId,
      task: "live_suggestion",
      promptVersion: prompt.version,
      provider: this.provider.provider,
    });
    const transcriptContext = assembleRollingTranscriptContext({
      segments: input.transcriptSegments,
      maxSegments: this.maxTranscriptSegments,
      maxChars: this.maxTranscriptChars,
    });
    const suggestionId = `sug_${input.requestId}`;
    const tokens: string[] = [];
    let complete: LiveSuggestionProviderComplete | undefined;

    try {
      for await (const event of this.provider.streamLiveSuggestion({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        requestId: input.requestId,
        kind: input.kind,
        prompt,
        transcriptContext,
        ...(input.userPrompt === undefined ? {} : { userPrompt: input.userPrompt }),
        maxOutputChars: prompt.maxOutputChars,
      })) {
        if (event.type === "token") {
          const index = tokens.length;
          tokens.push(event.token);
          yield {
            type: "token",
            requestId: input.requestId,
            suggestionId,
            token: event.token,
            index,
          };
          continue;
        }

        complete = event;
      }
    } catch (err) {
      if (err instanceof ModelGatewayError) {
        throw err;
      }
      throw new ModelGatewayError("Live suggestion provider failed.", "llm_provider_timeout");
    }

    if (complete === undefined) {
      throw new ModelGatewayError(
        "Live suggestion provider did not complete.",
        "invalid_model_response",
      );
    }

    const content = tokens.join("").slice(0, prompt.maxOutputChars);
    const completedAt = input.now?.() ?? Date.now();
    yield {
      type: "complete",
      requestId: input.requestId,
      suggestionId,
      kind: input.kind,
      content,
      sources: [],
      confidence: complete.confidence ?? "medium",
      promptVersion: prompt.version,
      model: complete.model,
      telemetry: [
        route.telemetry,
        createTelemetryEvent("ai.live_generation_completed", {
          workspaceId: input.workspaceId,
          sessionId: input.sessionId,
          requestId: input.requestId,
          kind: input.kind,
          provider: this.provider.provider,
          model: complete.model,
          templateVersion: prompt.version,
          routeExternal: route.externalCallEnabled,
          latencyMs: Math.max(0, completedAt - startedAt),
          inputSegmentCount: input.transcriptSegments.length,
          outputTokenCount: tokens.length,
          status: "ok",
        }),
      ],
    };
  }
}

export interface OpenAiResponsesTransportRequest {
  model: string;
  developerInstruction: string;
  userInput: string;
  maxOutputChars: number;
}

export interface OpenAiResponsesTransport {
  createStream(request: OpenAiResponsesTransportRequest): AsyncIterable<Record<string, unknown>>;
}

export class OpenAiResponsesLiveSuggestionProvider implements LiveSuggestionProvider {
  readonly provider = "openai" as const;
  readonly externalCallEnabled = true;

  constructor(
    private readonly transport: OpenAiResponsesTransport,
    private readonly model: string,
  ) {}

  async *streamLiveSuggestion(
    request: LiveSuggestionProviderRequest,
  ): AsyncIterable<LiveSuggestionProviderEvent> {
    let completed = false;
    for await (const event of this.transport.createStream({
      model: this.model,
      developerInstruction: request.prompt.systemInstruction,
      userInput: createProviderUserInput(request),
      maxOutputChars: request.maxOutputChars,
    })) {
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        yield { type: "token", token: event.delta };
      }

      if (event.type === "response.completed") {
        completed = true;
      }
    }

    if (!completed) {
      throw new ModelGatewayError(
        "OpenAI response stream did not complete.",
        "llm_provider_timeout",
      );
    }

    yield { type: "complete", model: this.model, confidence: "medium" };
  }
}

export function createOpenAiResponsesFetchTransport(options: {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}): OpenAiResponsesTransport {
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async *createStream(request) {
      const response = await fetchFn(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          input: [
            {
              role: "developer",
              content: request.developerInstruction,
            },
            {
              role: "user",
              content: request.userInput,
            },
          ],
          stream: true,
          store: false,
          max_output_tokens: Math.max(16, Math.ceil(request.maxOutputChars / 4)),
        }),
      });

      if (!response.ok || response.body === null) {
        throw new ModelGatewayError("OpenAI streaming request failed.", "llm_provider_timeout");
      }

      yield* parseSseJsonStream(response.body);
    },
  };
}

function createDeterministicSuggestion(request: LiveSuggestionProviderRequest): string {
  if (request.transcriptContext.length === 0) {
    return "I do not have enough transcript context yet. Ask for the key question or confirm the next topic.";
  }

  switch (request.kind) {
    case "answer_question":
      return "A concise answer would be: based on what we have discussed, we can confirm the requirement, outline the next step, and follow up with specifics after the call.";
    case "summarize_so_far":
      return "So far: the discussion has covered the current need, the open decision, and the next follow-up item.";
    case "suggest_follow_up":
      return "A useful follow-up is: what outcome would make this conversation successful for your team?";
    case "objection_response":
      return "A steady response is: that concern makes sense; we can reduce risk by starting with a focused pilot and clear success criteria.";
    default: {
      const _exhaustive: never = request.kind;
      return _exhaustive;
    }
  }
}

function createProviderUserInput(request: LiveSuggestionProviderRequest): string {
  const userPrompt =
    request.userPrompt === undefined || request.userPrompt.trim().length === 0
      ? "Use the recent transcript to produce the requested live suggestion."
      : request.userPrompt.trim();

  return [
    `Request kind: ${request.kind}`,
    `User request: ${userPrompt}`,
    "Recent transcript, oldest to newest:",
    request.transcriptContext.length === 0
      ? "(no final transcript yet)"
      : request.transcriptContext,
  ].join("\n");
}

async function* parseSseJsonStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseFrame(frame);
      if (event !== undefined) {
        yield event;
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode();
  const event = parseSseFrame(buffer);
  if (event !== undefined) {
    yield event;
  }
}

function parseSseFrame(frame: string): Record<string, unknown> | undefined {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (data.length === 0 || data === "[DONE]") {
    return undefined;
  }

  const parsed = JSON.parse(data) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as Record<string, unknown>;
}
