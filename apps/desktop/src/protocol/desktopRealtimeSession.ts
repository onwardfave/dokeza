import { validateRealtimeJsonMessage, type RealtimeJsonMessage } from "@dokeza/contracts";
import {
  createAudioChunkMetaMessage,
  createAudioGapMessage,
  createAuthHelloMessage,
  createInitialRealtimeClientState,
  createResumeRequestMessage,
  createSessionEndMessage,
  createSessionStartMessage,
  createSyntheticPcmChunks,
  type DesktopPlatform,
  type RealtimeClientState,
  type SyntheticPcmChunk,
  type SyntheticPcmOptions,
} from "./realtimeClient.js";
import {
  calculateReconnectDelayMs,
  InMemoryAudioBuffer,
  type AudioBufferLimits,
  type ReconnectBackoffOptions,
} from "./realtimeRecovery.js";

export type DesktopRealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "streaming"
  | "reconnecting"
  | "degraded"
  | "closed"
  | "failed";

export interface RealtimeTransportHandlers {
  onOpen(): void;
  onTextMessage(frame: string): void;
  onClose(): void;
  onError(error: Error): void;
}

export interface RealtimeTransport {
  sendText(frame: string): void;
  sendBinary(frame: Uint8Array): void;
  close(): void;
}

export interface RealtimeTransportFactory {
  connect(url: string, handlers: RealtimeTransportHandlers): RealtimeTransport;
}

export interface RealtimeScheduler {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
}

export interface DesktopRealtimeTranscript {
  segmentId: string;
  speaker: "user" | "remote" | "unknown";
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  final: boolean;
}

export interface DesktopRealtimeError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface DesktopRealtimeSnapshot {
  status: DesktopRealtimeStatus;
  sessionId?: string;
  connectionId?: string;
  workspaceId?: string;
  lastClientSeq: number;
  lastServerSeq: number;
  transcripts: DesktopRealtimeTranscript[];
  pendingAudioChunks?: number;
  pendingAudioBytes?: number;
  pendingAudioGaps?: number;
  reconnectAttempt?: number;
  nextReconnectDelayMs?: number;
  lastError?: DesktopRealtimeError;
  statusMessage?: string;
}

export interface DesktopRealtimeSessionClientOptions {
  endpoint: string;
  token: string;
  clientVersion: string;
  platform: DesktopPlatform;
  deviceId: string;
  transportFactory?: RealtimeTransportFactory;
  scheduler?: RealtimeScheduler;
  syntheticAudio?: SyntheticPcmOptions;
  audioBuffer?: Partial<AudioBufferLimits>;
  reconnectBackoff?: ReconnectBackoffOptions;
}

export class DesktopRealtimeSessionClient {
  private readonly transportFactory: RealtimeTransportFactory;
  private readonly scheduler: RealtimeScheduler;
  private readonly syntheticAudio: SyntheticPcmOptions;
  private readonly audioBuffer: InMemoryAudioBuffer;
  private readonly configuredAudioBufferMaxDurationMs: number;
  private readonly configuredAudioBufferMaxBytes: number;
  private readonly reconnectBackoff: ReconnectBackoffOptions;
  private transport: RealtimeTransport | undefined;
  private protocolState: RealtimeClientState = createInitialRealtimeClientState();
  private resumeRequested = false;
  private previousConnectionId: string | undefined;
  private reconnectAttempt = 0;
  private reconnectTimerId: number | undefined;
  private nextReconnectDelayMs: number | undefined;
  private state: DesktopRealtimeSnapshot = {
    status: "idle",
    lastClientSeq: 0,
    lastServerSeq: 0,
    transcripts: [],
  };

  constructor(private readonly options: DesktopRealtimeSessionClientOptions) {
    this.transportFactory = options.transportFactory ?? new BrowserRealtimeTransportFactory();
    this.scheduler = options.scheduler ?? new BrowserRealtimeScheduler();
    this.syntheticAudio = options.syntheticAudio ?? {};
    this.configuredAudioBufferMaxDurationMs = options.audioBuffer?.maxDurationMs ?? 300000;
    this.configuredAudioBufferMaxBytes = options.audioBuffer?.maxBytes ?? 25 * 1024 * 1024;
    this.audioBuffer = new InMemoryAudioBuffer({
      maxDurationMs: this.configuredAudioBufferMaxDurationMs,
      maxBytes: this.configuredAudioBufferMaxBytes,
    });
    this.reconnectBackoff = options.reconnectBackoff ?? {};
  }

  get snapshot(): DesktopRealtimeSnapshot {
    const buffer = this.audioBuffer.snapshot();
    const snapshot: DesktopRealtimeSnapshot = {
      ...this.state,
      transcripts: [...this.state.transcripts],
      pendingAudioChunks: buffer.pendingChunks,
      pendingAudioBytes: buffer.pendingBytes,
      pendingAudioGaps: buffer.pendingGaps,
      reconnectAttempt: this.reconnectAttempt,
    };
    if (this.state.lastError !== undefined) {
      snapshot.lastError = { ...this.state.lastError };
    }
    if (this.nextReconnectDelayMs !== undefined) {
      snapshot.nextReconnectDelayMs = this.nextReconnectDelayMs;
    }
    return snapshot;
  }

  startSyntheticSession(): void {
    this.resumeRequested = false;
    this.previousConnectionId = undefined;
    this.reconnectAttempt = 0;
    this.nextReconnectDelayMs = undefined;
    this.clearReconnectTimer();
    this.protocolState = createInitialRealtimeClientState();
    this.state = {
      status: "connecting",
      lastClientSeq: 0,
      lastServerSeq: 0,
      transcripts: [],
    };
    this.connect();
  }

  resume(): void {
    if (this.state.sessionId === undefined || this.state.connectionId === undefined) {
      this.state = { ...this.state, status: "failed" };
      return;
    }

    this.previousConnectionId = this.state.connectionId;
    this.resumeRequested = true;
    this.nextReconnectDelayMs = undefined;
    this.clearReconnectTimer();
    this.protocolState = createInitialRealtimeClientState();
    this.state = { ...this.state, status: "reconnecting" };
    this.connect();
  }

  stop(reason: "user_stopped" | "app_shutdown" | "policy_stopped" = "user_stopped"): void {
    if (this.transport === undefined || this.state.sessionId === undefined) {
      return;
    }

    this.sendJson(createSessionEndMessage(this.protocolState, this.state.sessionId, reason));
  }

  sendAudioChunk(chunk: SyntheticPcmChunk): void {
    this.audioBuffer.enqueue(chunk);
    if (this.state.status === "streaming") {
      this.flushBufferedAudio();
    }
  }

  private connect(): void {
    this.transport = this.transportFactory.connect(this.options.endpoint, {
      onOpen: () => this.handleOpen(),
      onTextMessage: (frame) => this.handleTextMessage(frame),
      onClose: () => this.handleClose(),
      onError: () => this.handleTransportError(),
    });
  }

  private handleOpen(): void {
    this.sendJson(
      createAuthHelloMessage(this.protocolState, {
        token: this.options.token,
        clientVersion: this.options.clientVersion,
        platform: this.options.platform,
        deviceId: this.options.deviceId,
      }),
    );
  }

  private handleTextMessage(frame: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(frame);
    } catch {
      this.state = { ...this.state, status: "failed" };
      return;
    }

    if (!validateRealtimeJsonMessage(parsed)) {
      this.state = { ...this.state, status: "failed" };
      return;
    }

    this.recordServerSeq(parsed.seq);

    switch (parsed.type) {
      case "auth.accepted":
        this.handleAuthAccepted(parsed);
        break;
      case "transcript.partial":
      case "transcript.final":
        this.upsertTranscript(parsed);
        break;
      case "session.status":
        this.state = {
          ...this.state,
          status: parsed.payload.recoverable ? "degraded" : "failed",
          statusMessage: parsed.payload.message,
        };
        break;
      case "error":
        this.state = {
          ...this.state,
          status: parsed.payload.recoverable ? "degraded" : "failed",
          lastError: {
            code: parsed.payload.code,
            message: parsed.payload.message,
            recoverable: parsed.payload.recoverable,
          },
        };
        break;
      case "session.closed":
        this.state = { ...this.state, status: "closed" };
        break;
      default:
        break;
    }
  }

  private handleAuthAccepted(message: Extract<RealtimeJsonMessage, { type: "auth.accepted" }>) {
    if (this.resumeRequested) {
      const originalSessionId = this.state.sessionId;
      const previousConnectionId = this.previousConnectionId;
      if (originalSessionId === undefined || previousConnectionId === undefined) {
        this.state = { ...this.state, status: "failed" };
        return;
      }

      this.audioBuffer.setLimits({
        maxDurationMs: Math.min(
          this.configuredAudioBufferMaxDurationMs,
          message.payload.policy.max_local_audio_buffer_ms,
        ),
        maxBytes: this.configuredAudioBufferMaxBytes,
      });
      this.state = {
        ...this.state,
        connectionId: message.payload.connection_id,
        workspaceId: message.payload.workspace_id,
      };
      this.sendJson(
        createResumeRequestMessage(this.protocolState, {
          sessionId: originalSessionId,
          previousConnectionId,
          lastClientSeq: this.state.lastClientSeq,
          lastServerSeq: this.state.lastServerSeq,
        }),
      );
      this.flushBufferedAudio();
      return;
    }

    this.audioBuffer.setLimits({
      maxDurationMs: Math.min(
        this.configuredAudioBufferMaxDurationMs,
        message.payload.policy.max_local_audio_buffer_ms,
      ),
      maxBytes: this.configuredAudioBufferMaxBytes,
    });
    this.state = {
      ...this.state,
      status: "connected",
      sessionId: message.session_id,
      connectionId: message.payload.connection_id,
      workspaceId: message.payload.workspace_id,
    };
    this.sendJson(
      createSessionStartMessage(this.protocolState, {
        sessionId: message.session_id,
        workspaceId: message.payload.workspace_id,
        deviceId: this.options.deviceId,
      }),
    );
    this.state = { ...this.state, status: "streaming" };
    this.sendSyntheticAudio(message.session_id);
  }

  private sendSyntheticAudio(sessionId: string): void {
    for (const chunk of createSyntheticPcmChunks(this.syntheticAudio)) {
      this.sendAudioChunk(chunk);
    }
  }

  private flushBufferedAudio(): void {
    if (this.state.sessionId === undefined) {
      return;
    }

    for (const gap of this.audioBuffer.drainGaps()) {
      this.sendJson(createAudioGapMessage(this.protocolState, this.state.sessionId, gap));
    }

    for (const chunk of this.audioBuffer.drainChunks()) {
      this.sendJson(createAudioChunkMetaMessage(this.protocolState, this.state.sessionId, chunk.meta));
      this.transport?.sendBinary(chunk.bytes);
    }
  }

  private sendJson(message: RealtimeJsonMessage): void {
    this.state = { ...this.state, lastClientSeq: Math.max(this.state.lastClientSeq, message.seq) };
    this.transport?.sendText(JSON.stringify(message));
  }

  private upsertTranscript(
    message: Extract<RealtimeJsonMessage, { type: "transcript.partial" | "transcript.final" }>,
  ): void {
    const transcript: DesktopRealtimeTranscript = {
      segmentId: message.payload.segment_id,
      speaker: message.payload.speaker,
      text: message.payload.text,
      startMs: message.payload.start_ms,
      endMs: message.payload.end_ms,
      confidence: message.payload.confidence,
      final: message.type === "transcript.final",
    };
    const transcripts = this.state.transcripts.filter(
      (existing) => existing.segmentId !== transcript.segmentId,
    );
    transcripts.push(transcript);
    this.state = {
      ...this.state,
      status: this.state.status === "reconnecting" ? "streaming" : this.state.status,
      transcripts,
    };
  }

  private recordServerSeq(seq: number): void {
    this.state = { ...this.state, lastServerSeq: Math.max(this.state.lastServerSeq, seq) };
  }

  private handleClose(): void {
    if (this.state.status === "streaming" || this.state.status === "degraded") {
      this.state = { ...this.state, status: "reconnecting" };
      this.scheduleReconnect();
      return;
    }

    if (this.state.status !== "closed") {
      this.state = { ...this.state, status: "closed" };
    }
  }

  private handleTransportError(): void {
    this.state = { ...this.state, status: "failed" };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimerId !== undefined) {
      return;
    }

    const delayMs = calculateReconnectDelayMs(this.reconnectAttempt, this.reconnectBackoff);
    this.nextReconnectDelayMs = delayMs;
    this.reconnectAttempt += 1;
    this.reconnectTimerId = this.scheduler.setTimeout(() => {
      this.reconnectTimerId = undefined;
      this.resume();
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimerId !== undefined) {
      this.scheduler.clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = undefined;
    }
  }
}

class BrowserRealtimeScheduler implements RealtimeScheduler {
  setTimeout(callback: () => void, delayMs: number): number {
    return globalThis.setTimeout(callback, delayMs) as unknown as number;
  }

  clearTimeout(timerId: number): void {
    globalThis.clearTimeout(timerId);
  }
}

export class BrowserRealtimeTransportFactory implements RealtimeTransportFactory {
  connect(url: string, handlers: RealtimeTransportHandlers): RealtimeTransport {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => handlers.onOpen());
    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        handlers.onTextMessage(event.data);
      }
    });
    socket.addEventListener("close", () => handlers.onClose());
    socket.addEventListener("error", () => handlers.onError(new Error("websocket_error")));
    return new BrowserRealtimeTransport(socket);
  }
}

class BrowserRealtimeTransport implements RealtimeTransport {
  constructor(private readonly socket: WebSocket) {}

  sendText(frame: string): void {
    this.socket.send(frame);
  }

  sendBinary(frame: Uint8Array): void {
    const copy = new ArrayBuffer(frame.byteLength);
    new Uint8Array(copy).set(frame);
    this.socket.send(copy);
  }

  close(): void {
    this.socket.close();
  }
}
