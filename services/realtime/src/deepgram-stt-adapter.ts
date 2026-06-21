import type { DeepgramSttConfig } from "@dokeza/config";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";
import WebSocket, { type RawData } from "ws";
import type { SttAdapter, SttAdapterResult, SttChunkInput, SttTranscriptEvent } from "./stt-adapter.js";

export interface DeepgramAlternative {
  transcript?: string;
  confidence?: number;
}

export interface DeepgramResultsMessage {
  type: "Results";
  is_final?: boolean;
  speech_final?: boolean;
  start?: number;
  duration?: number;
  channel?: {
    alternatives?: DeepgramAlternative[];
  };
}

export type DeepgramSttProviderMessage =
  | DeepgramResultsMessage
  | {
      type?: string;
      [key: string]: unknown;
    };

export interface DeepgramSttTransportInput {
  url: string;
  headers: Record<string, string>;
  audio: Uint8Array;
  timeoutMs: number;
}

export interface DeepgramSttTransport {
  transcribe(input: DeepgramSttTransportInput): Promise<DeepgramSttProviderMessage[]>;
}

export type DeepgramSttAdapterOptions = Partial<DeepgramSttConfig> & {
  apiKey: string;
  transport?: DeepgramSttTransport;
};

interface ResolvedDeepgramSttAdapterOptions {
  apiKey: string;
  endpoint: string;
  model: string;
  language: string;
  interimResults: boolean;
  punctuate: boolean;
  smartFormat: boolean;
  encoding: "linear16";
  sampleRateHz: number;
  channels: number;
  timeoutMs: number;
  transport: DeepgramSttTransport;
}

function isDeepgramResultsMessage(message: DeepgramSttProviderMessage): message is DeepgramResultsMessage {
  return message.type === "Results";
}

function rawDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  return Buffer.from(data).toString("utf8");
}

export class DeepgramWebSocketTransport implements DeepgramSttTransport {
  async transcribe(input: DeepgramSttTransportInput): Promise<DeepgramSttProviderMessage[]> {
    return await new Promise<DeepgramSttProviderMessage[]>((resolve, reject) => {
      const messages: DeepgramSttProviderMessage[] = [];
      const socket = new WebSocket(input.url, { headers: input.headers });
      let settled = false;

      const settle = (callback: () => void): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        callback();
      };

      const timeout = setTimeout(() => {
        socket.close();
        settle(() => reject(new Error("Deepgram STT request timed out.")));
      }, input.timeoutMs);

      socket.once("open", () => {
        socket.send(input.audio);
        socket.send(JSON.stringify({ type: "Finalize" }));
        socket.send(JSON.stringify({ type: "CloseStream" }));
      });

      socket.on("message", (data) => {
        try {
          const parsed = JSON.parse(rawDataToString(data)) as DeepgramSttProviderMessage;
          messages.push(parsed);

          if (
            isDeepgramResultsMessage(parsed) &&
            parsed.is_final === true &&
            parsed.speech_final === true
          ) {
            socket.close();
          }
        } catch {
          settle(() => reject(new Error("Deepgram STT response was not valid JSON.")));
        }
      });

      socket.once("error", () => {
        settle(() => reject(new Error("Deepgram STT WebSocket failed.")));
      });

      socket.once("close", () => {
        settle(() => resolve(messages));
      });
    });
  }
}

export class DeepgramSttAdapter implements SttAdapter {
  private readonly options: ResolvedDeepgramSttAdapterOptions;

  constructor(options: DeepgramSttAdapterOptions) {
    this.options = {
      apiKey: options.apiKey,
      endpoint: options.endpoint ?? "wss://api.deepgram.com/v1/listen",
      model: options.model ?? "nova-3",
      language: options.language ?? "en",
      interimResults: options.interimResults ?? true,
      punctuate: options.punctuate ?? true,
      smartFormat: options.smartFormat ?? true,
      encoding: options.encoding ?? "linear16",
      sampleRateHz: options.sampleRateHz ?? 16000,
      channels: options.channels ?? 1,
      timeoutMs: options.timeoutMs ?? 5000,
      transport: options.transport ?? new DeepgramWebSocketTransport(),
    };
  }

  async transcribeChunk(input: SttChunkInput): Promise<SttAdapterResult> {
    try {
      const providerMessages = await this.options.transport.transcribe({
        url: this.createRequestUrl(),
        headers: {
          authorization: `Token ${this.options.apiKey}`,
        },
        audio: input.bytes,
        timeoutMs: this.options.timeoutMs,
      });
      const events = this.mapProviderMessages(input, providerMessages);

      return {
        events,
        telemetry: [this.createSuccessTelemetry(input, providerMessages.length, events)],
      };
    } catch {
      return {
        error: {
          code: "stt_provider_timeout",
          message: "Deepgram STT provider request failed.",
          recoverable: true,
          retry_after_ms: this.options.timeoutMs,
        },
        telemetry: [this.createFailureTelemetry(input)],
      };
    }
  }

  private createRequestUrl(): string {
    const url = new URL(this.options.endpoint);
    url.searchParams.set("model", this.options.model);
    url.searchParams.set("language", this.options.language);
    url.searchParams.set("interim_results", String(this.options.interimResults));
    url.searchParams.set("punctuate", String(this.options.punctuate));
    url.searchParams.set("smart_format", String(this.options.smartFormat));
    url.searchParams.set("encoding", this.options.encoding);
    url.searchParams.set("sample_rate", String(this.options.sampleRateHz));
    url.searchParams.set("channels", String(this.options.channels));
    return url.toString();
  }

  private mapProviderMessages(
    input: SttChunkInput,
    messages: DeepgramSttProviderMessage[],
  ): SttTranscriptEvent[] {
    const speaker = input.meta.stream === "microphone" ? "user" : "remote";
    const events: SttTranscriptEvent[] = [];

    for (const message of messages) {
      if (!isDeepgramResultsMessage(message)) {
        continue;
      }

      const alternative = message.channel?.alternatives?.[0];
      const text = alternative?.transcript?.trim();
      if (text === undefined || text.length === 0) {
        continue;
      }

      const offsetMs = Math.round((message.start ?? 0) * 1000);
      const durationMs = Math.round((message.duration ?? 0) * 1000);
      const startMs = input.meta.timestamp_ms + offsetMs;
      const endMs = startMs + durationMs;

      events.push({
        type: message.is_final === true ? "transcript.final" : "transcript.partial",
        payload: {
          segment_id: `dg_${input.meta.chunk_id}_${startMs}`,
          speaker,
          text,
          start_ms: startMs,
          end_ms: endMs,
          confidence: alternative?.confidence ?? 0,
        },
      });
    }

    return events;
  }

  private createSuccessTelemetry(
    input: SttChunkInput,
    providerMessageCount: number,
    events: SttTranscriptEvent[],
  ): TelemetryEvent {
    return createTelemetryEvent("realtime.deepgram_stt_chunk_transcribed", {
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      provider: "deepgram",
      model: this.options.model,
      stream: input.meta.stream,
      chunkIndex: input.meta.chunk_index,
      byteLength: input.bytes.byteLength,
      durationMs: input.meta.duration_ms,
      providerMessageCount,
      eventCount: events.length,
      finalEventCount: events.filter((event) => event.type === "transcript.final").length,
    });
  }

  private createFailureTelemetry(input: SttChunkInput): TelemetryEvent {
    return createTelemetryEvent("realtime.deepgram_stt_chunk_failed", {
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      provider: "deepgram",
      model: this.options.model,
      stream: input.meta.stream,
      chunkIndex: input.meta.chunk_index,
      byteLength: input.bytes.byteLength,
      durationMs: input.meta.duration_ms,
      failureCode: "provider_request_failed",
    });
  }
}
