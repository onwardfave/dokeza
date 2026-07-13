import { describe, expect, it, vi } from "vitest";
import {
  createNativeMicrophoneStreamSource,
  listMicrophoneCaptureDevices,
  type NativeMicrophoneStreamEvent,
} from "./nativeMicrophoneSource.js";

describe("native microphone source", () => {
  it("lists selectable microphone capture devices", async () => {
    const invoke = vi.fn().mockResolvedValue([
      {
        id: "input_0",
        name: "Default array",
        is_default: true,
      },
    ]);

    await expect(listMicrophoneCaptureDevices(invoke)).resolves.toEqual([
      {
        id: "input_0",
        name: "Default array",
        is_default: true,
      },
    ]);
    expect(invoke).toHaveBeenCalledWith("list_microphone_capture_devices");
  });

  it("opens one typed native channel and controls the long-lived stream", async () => {
    let onMessage: ((event: NativeMicrophoneStreamEvent) => void) | undefined;
    const channel = {
      set onmessage(handler: (event: NativeMicrophoneStreamEvent) => void) {
        onMessage = handler;
      },
    };
    const invoke = vi.fn().mockResolvedValue(undefined);
    const received: NativeMicrophoneStreamEvent[] = [];
    const source = createNativeMicrophoneStreamSource({
      invoke,
      createChannel: () => channel,
    });

    const handle = await source.start("mic_deadbeef_0", (event) => received.push(event));
    const event: NativeMicrophoneStreamEvent = {
      type: "gap",
      reason: "local_buffer_full",
      dropped_chunks: 2,
    };
    onMessage?.(event);
    await handle.pause();
    await handle.resume();
    await handle.stop();

    expect(invoke.mock.calls).toEqual([
      ["start_microphone_stream", { deviceId: "mic_deadbeef_0", onEvent: channel }],
      ["pause_microphone_stream"],
      ["resume_microphone_stream"],
      ["stop_microphone_stream"],
    ]);
    expect(received).toEqual([event]);
  });
});
