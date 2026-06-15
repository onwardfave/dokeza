import { describe, expect, it, afterEach } from "vitest";
import { WebSocket } from "ws";
import { REALTIME_PROTOCOL_VERSION } from "@dokeza/contracts";
import { createTestActor } from "@dokeza/test-fixtures";
import {
  createRealtimeServer,
  type RealtimeServerHandle,
  type TokenValidator,
} from "./ws-server.js";

const TEST_PORT = 0; // OS-assigned port

function createTestTokenValidator(): TokenValidator {
  return {
    async validate(token: string) {
      if (token === "valid_token") {
        return createTestActor({ workspaceId: "ws_test_1" });
      }
      return undefined;
    },
  };
}

function getServerPort(handle: RealtimeServerHandle): number {
  const addr = handle.httpServer.address();
  if (addr === null || typeof addr === "string") throw new Error("Server not listening");
  return addr.port;
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function sendAndReceive(
  ws: WebSocket,
  message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout waiting for response")), 3000);
    ws.once("message", (data) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      }
    });
    ws.send(JSON.stringify(message));
  });
}

function waitForClose(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.on("close", (code) => resolve(code));
  });
}

describe("createRealtimeServer", () => {
  let handle: RealtimeServerHandle | undefined;
  const clients: WebSocket[] = [];

  afterEach(async () => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    clients.length = 0;
    if (handle !== undefined) {
      await handle.close();
      handle = undefined;
    }
  });

  async function startServer(): Promise<{ port: number }> {
    handle = createRealtimeServer({
      port: TEST_PORT,
      tokenValidator: createTestTokenValidator(),
    });
    await new Promise<void>((resolve) => {
      handle!.httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    return { port: getServerPort(handle) };
  }

  async function connect(port: number): Promise<WebSocket> {
    const ws = await connectClient(port);
    clients.push(ws);
    return ws;
  }

  it("accepts a valid auth.hello and returns auth.accepted", async () => {
    const { port } = await startServer();
    const ws = await connect(port);

    const response = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });

    expect(response.type).toBe("auth.accepted");
    expect(response.protocol_version).toBe(REALTIME_PROTOCOL_VERSION);
    expect((response.payload as Record<string, unknown>).workspace_id).toBe("ws_test_1");
  });

  it("rejects an invalid token and closes the connection", async () => {
    const { port } = await startServer();
    const ws = await connect(port);
    const closePromise = waitForClose(ws);

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "auth.hello",
        seq: 1,
        sent_at: new Date().toISOString(),
        payload: {
          token: "bad_token",
          client_version: "0.1.0",
          platform: "windows",
          device_id: "dev_test_1",
        },
      }),
    );

    const code = await closePromise;
    expect(code).toBe(1008);
  });

  it("rejects messages before authentication", async () => {
    const { port } = await startServer();
    const ws = await connect(port);
    const closePromise = waitForClose(ws);

    ws.send(
      JSON.stringify({
        protocol_version: REALTIME_PROTOCOL_VERSION,
        type: "session.start",
        seq: 1,
        session_id: "sess_fake",
        sent_at: new Date().toISOString(),
        payload: {
          workspace_id: "ws_test_1",
          meeting_source: "test",
          capture: { microphone: true, system_audio: false, screen_context: false },
          processing: { stt: "cloud", llm: "cloud", retrieval: "cloud" },
        },
      }),
    );

    const code = await closePromise;
    expect(code).toBe(1008);
  });

  it("handles a full session lifecycle: auth → session.end → session.closed", async () => {
    const { port } = await startServer();
    const ws = await connect(port);

    // Authenticate
    const authResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });
    expect(authResponse.type).toBe("auth.accepted");
    const sessionId = authResponse.session_id as string;

    // End session
    const closedResponse = await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "session.end",
      seq: 2,
      session_id: sessionId,
      sent_at: new Date().toISOString(),
      payload: {
        reason: "user_stopped",
        last_client_seq: 2,
      },
    });

    expect(closedResponse.type).toBe("session.closed");
    expect((closedResponse.payload as Record<string, unknown>).reason).toBe("user_stopped");
  });

  it("tracks active sessions in the session manager", async () => {
    const { port } = await startServer();
    expect(handle!.sessionManager.activeSessionCount).toBe(0);

    const ws = await connect(port);
    await sendAndReceive(ws, {
      protocol_version: REALTIME_PROTOCOL_VERSION,
      type: "auth.hello",
      seq: 1,
      sent_at: new Date().toISOString(),
      payload: {
        token: "valid_token",
        client_version: "0.1.0",
        platform: "windows",
        device_id: "dev_test_1",
      },
    });

    expect(handle!.sessionManager.activeSessionCount).toBe(1);

    ws.close();
    // Wait for close to propagate
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(handle!.sessionManager.activeSessionCount).toBe(0);
  });
});
