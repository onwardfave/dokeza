import { Channel, invoke as tauriInvoke } from "@tauri-apps/api/core";
export interface NativeMicrophoneCaptureDevice {
  id: string;
  name?: string;
  is_default: boolean;
}

export interface NativeMicrophoneStreamChunk {
  stream: "microphone";
  format: "pcm_s16le";
  sample_rate_hz: 16000;
  channels: 1;
  duration_ms: 100;
  byte_length: 3200;
  bytes: number[];
}

export type NativeMicrophoneStreamEvent =
  | { type: "chunk"; chunk: NativeMicrophoneStreamChunk }
  | {
      type: "gap";
      reason: "local_buffer_full" | "user_paused_capture";
      dropped_chunks: number;
    }
  | {
      type: "error";
      code: "microphone_stream_failed" | "microphone_permission_denied";
      recoverable: boolean;
    }
  | { type: "state"; state: "capturing" | "paused" | "stopped" };

export interface NativeMicrophoneStreamHandle {
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}

export interface NativeMicrophoneStreamSource {
  start(
    deviceId: string | undefined,
    onEvent: (event: NativeMicrophoneStreamEvent) => void,
  ): Promise<NativeMicrophoneStreamHandle>;
}

export interface NativeMicrophoneEventChannel {
  onmessage: (event: NativeMicrophoneStreamEvent) => void;
}

export interface NativeMicrophoneStreamRuntime {
  invoke: NativeInvoke;
  createChannel(): NativeMicrophoneEventChannel;
}

export type NativeInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export async function listMicrophoneCaptureDevices(
  invoke: NativeInvoke = tauriInvoke,
): Promise<NativeMicrophoneCaptureDevice[]> {
  return invoke<NativeMicrophoneCaptureDevice[]>("list_microphone_capture_devices");
}

export function createNativeMicrophoneStreamSource(
  runtime: NativeMicrophoneStreamRuntime = {
    invoke: tauriInvoke,
    createChannel: () => new Channel<NativeMicrophoneStreamEvent>(),
  },
): NativeMicrophoneStreamSource {
  return {
    async start(deviceId, onEvent) {
      const onEventChannel = runtime.createChannel();
      onEventChannel.onmessage = onEvent;
      await runtime.invoke("start_microphone_stream", {
        deviceId,
        onEvent: onEventChannel,
      });

      return {
        pause: () => runtime.invoke("pause_microphone_stream"),
        resume: () => runtime.invoke("resume_microphone_stream"),
        stop: async () => {
          await runtime.invoke("stop_microphone_stream");
          // Retain the Channel for the stream lifetime, then release its application callback.
          onEventChannel.onmessage = () => undefined;
        },
      };
    },
  };
}
