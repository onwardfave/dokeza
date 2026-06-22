import { describe, expect, it, vi } from "vitest";
import {
  DeepgramSttAdapter,
  type DeepgramStreamingConnection,
  type DeepgramStreamingTransport,
  type DeepgramStreamingTransportInput,
  type DeepgramSttProviderMessage,
  type DeepgramSttTransport,
  type DeepgramSttTransportInput,
} from "./deepgram-stt-adapter.js";
import type { SttChunkInput, SttTranscriptEvent } from "./stt-adapter.js";

function createChunkInput(): SttChunkInput {
  return {
    sessionId: "sess_test",
    workspaceId: "ws_test",
    meta: {
      chunk_id: "aud_1",
      chunk_index: 2,
      stream: "microphone",
      format: "pcm_s16le",
      sample_rate_hz: 16000,
      channels: 1,
      duration_ms: 500,
      timestamp_ms: 1_000,
      byte_length: 4,
    },
    bytes: new Uint8Array([1, 2, 3, 4]),
  };
}

function resultMessage(
  overrides: Partial<DeepgramSttProviderMessage> = {},
): DeepgramSttProviderMessage {
  return {
    type: "Results",
    is_final: false,
    speech_final: false,
    start: 0.25,
    duration: 0.5,
    channel: {
      alternatives: [
        {
          transcript: "hello from deepgram",
          confidence: 0.87,
        },
      ],
    },
    ...overrides,
  };
}

describe("DeepgramSttAdapter", () => {
  it("builds a Deepgram request without exposing credentials in telemetry", async () => {
    const transport: DeepgramSttTransport = {
      transcribe: vi.fn(async () => [resultMessage()]),
    };
    const adapter = new DeepgramSttAdapter({
      apiKey: "dg_test_secret",
      endpoint: "wss://api.deepgram.com/v1/listen",
      model: "nova-3",
      language: "en",
      interimResults: true,
      punctuate: true,
      smartFormat: true,
      encoding: "linear16",
      sampleRateHz: 16000,
      channels: 1,
      timeoutMs: 5000,
      transport,
    });

    const result = await adapter.transcribeChunk(createChunkInput());

    expect(transport.transcribe).toHaveBeenCalledTimes(1);
    const request = vi.mocked(transport.transcribe).mock.calls[0]?.[0] as
      | DeepgramSttTransportInput
      | undefined;
    expect(request).toBeDefined();
    if (request === undefined) throw new Error("Expected Deepgram transport request");

    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe("wss://api.deepgram.com/v1/listen");
    expect(url.searchParams.get("model")).toBe("nova-3");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("interim_results")).toBe("true");
    expect(url.searchParams.get("punctuate")).toBe("true");
    expect(url.searchParams.get("smart_format")).toBe("true");
    expect(url.searchParams.get("encoding")).toBe("linear16");
    expect(url.searchParams.get("sample_rate")).toBe("16000");
    expect(url.searchParams.get("channels")).toBe("1");
    expect(request.headers.authorization).toBe("Token dg_test_secret");
    expect(request.audio).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(request.timeoutMs).toBe(5000);

    const telemetryJson = JSON.stringify(result.telemetry);
    expect(telemetryJson).not.toContain("dg_test_secret");
    expect(telemetryJson).not.toContain("hello from deepgram");
    expect(telemetryJson).not.toContain("[1,2,3,4]");
  });

  it("maps interim and final Deepgram results to transcript events", async () => {
    const transport: DeepgramSttTransport = {
      transcribe: vi.fn(async () => [
        resultMessage({
          is_final: false,
          start: 0,
          duration: 0.25,
          channel: {
            alternatives: [{ transcript: "hello", confidence: 0.6 }],
          },
        }),
        resultMessage({
          is_final: true,
          speech_final: true,
          start: 0,
          duration: 0.5,
          channel: {
            alternatives: [{ transcript: "hello world", confidence: 0.92 }],
          },
        }),
      ]),
    };
    const adapter = new DeepgramSttAdapter({
      apiKey: "dg_test_secret",
      transport,
    });

    const result = await adapter.transcribeChunk(createChunkInput());

    expect("events" in result).toBe(true);
    if (!("events" in result)) throw new Error("Expected transcript events");
    expect(result.events).toEqual([
      {
        type: "transcript.partial",
        payload: {
          segment_id: "dg_aud_1_1000",
          speaker: "user",
          text: "hello",
          start_ms: 1000,
          end_ms: 1250,
          confidence: 0.6,
        },
      },
      {
        type: "transcript.final",
        payload: {
          segment_id: "dg_aud_1_1000",
          speaker: "user",
          text: "hello world",
          start_ms: 1000,
          end_ms: 1500,
          confidence: 0.92,
        },
      },
    ]);
  });

  it("ignores empty transcripts and non-result provider messages", async () => {
    const transport: DeepgramSttTransport = {
      transcribe: vi.fn(async () => [
        { type: "Metadata", request_id: "req_1" },
        resultMessage({
          is_final: true,
          channel: {
            alternatives: [{ transcript: "   ", confidence: 0.3 }],
          },
        }),
      ]),
    };
    const adapter = new DeepgramSttAdapter({
      apiKey: "dg_test_secret",
      transport,
    });

    const result = await adapter.transcribeChunk(createChunkInput());

    expect("events" in result).toBe(true);
    if (!("events" in result)) throw new Error("Expected transcript events");
    expect(result.events).toEqual([]);
  });

  it("maps transport failures to recoverable STT errors", async () => {
    const transport: DeepgramSttTransport = {
      transcribe: vi.fn(async () => {
        throw new Error("network failed with transcript hello");
      }),
    };
    const adapter = new DeepgramSttAdapter({
      apiKey: "dg_test_secret",
      timeoutMs: 2500,
      transport,
    });

    const result = await adapter.transcribeChunk(createChunkInput());

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("Expected STT error");
    expect(result.error).toEqual({
      code: "stt_provider_timeout",
      message: "Deepgram STT provider request failed.",
      recoverable: true,
      retry_after_ms: 2500,
    });
    const telemetryJson = JSON.stringify(result.telemetry);
    expect(telemetryJson).not.toContain("hello");
    expect(telemetryJson).not.toContain("dg_test_secret");
  });

  it("streams multiple chunks through one Deepgram session transport", async () => {
    const sentAudio: Uint8Array[] = [];
    const controlMessages: string[] = [];
    let transportInput: DeepgramStreamingTransportInput | undefined;
    const streamingConnection: DeepgramStreamingConnection = {
      async sendAudio(bytes) {
        sentAudio.push(bytes);
      },
      async sendControl(message) {
        controlMessages.push(message.type);
      },
      async close() {
        controlMessages.push("socket.close");
      },
    };
    const streamingTransport: DeepgramStreamingTransport = {
      connect: vi.fn(async (input) => {
        transportInput = input;
        return streamingConnection;
      }),
    };
    const adapter = new DeepgramSttAdapter({
      apiKey: "dg_test_secret",
      endpoint: "wss://api.deepgram.com/v1/listen",
      model: "nova-3",
      language: "en",
      interimResults: true,
      punctuate: true,
      smartFormat: true,
      encoding: "linear16",
      sampleRateHz: 16000,
      channels: 1,
      timeoutMs: 5000,
      streamingTransport,
    });
    const transcriptEvents: SttTranscriptEvent[] = [];
    const errors: string[] = [];

    const session = await adapter.startSession({
      sessionId: "sess_test",
      workspaceId: "ws_test",
      emitTranscriptEvents(events) {
        transcriptEvents.push(...events);
      },
      emitError(error) {
        errors.push(error.code);
      },
    });

    expect(streamingTransport.connect).toHaveBeenCalledTimes(1);
    expect(transportInput).toBeDefined();
    if (transportInput === undefined) {
      throw new Error("Expected Deepgram streaming transport input");
    }
    const url = new URL(transportInput.url);
    expect(url.origin + url.pathname).toBe("wss://api.deepgram.com/v1/listen");
    expect(url.searchParams.get("model")).toBe("nova-3");
    expect(transportInput.headers.authorization).toBe("Token dg_test_secret");
    expect(transportInput.timeoutMs).toBe(5000);

    const first = await session.transcribeChunk(createChunkInput());
    const second = await session.transcribeChunk({
      ...createChunkInput(),
      meta: { ...createChunkInput().meta, chunk_id: "aud_2", chunk_index: 3 },
      bytes: new Uint8Array([5, 6]),
    });

    expect("events" in first && first.events).toEqual([]);
    expect("events" in second && second.events).toEqual([]);
    expect(sentAudio).toEqual([new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6])]);

    transportInput.emitProviderMessage(
      resultMessage({
        is_final: true,
        start: 0,
        duration: 0.5,
        channel: {
          alternatives: [{ transcript: "streamed final", confidence: 0.94 }],
        },
      }),
    );

    expect(transcriptEvents).toEqual([
      {
        type: "transcript.final",
        payload: {
          segment_id: "dg_sess_test_1000",
          speaker: "user",
          text: "streamed final",
          start_ms: 1000,
          end_ms: 1500,
          confidence: 0.94,
        },
      },
    ]);

    transportInput.emitProviderError();
    expect(errors).toEqual(["stt_provider_timeout"]);

    await session.close("session.end");
    expect(controlMessages).toEqual(["Finalize", "CloseStream", "socket.close"]);

    const telemetryJson = JSON.stringify([...first.telemetry, ...second.telemetry]);
    expect(telemetryJson).not.toContain("dg_test_secret");
    expect(telemetryJson).not.toContain("streamed final");
    expect(telemetryJson).not.toContain("[1,2,3,4]");
  });
});
