import { describe, expect, it, vi } from "vitest";
import { clearApiSession, loadApiSession, saveApiSession } from "./secureTokenStorage.js";

describe("secureTokenStorage", () => {
  it("saves API sessions through the native secure token command", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "saved" });

    await expect(
      saveApiSession(
        {
          token: "api_secret_token",
          expiresAt: "2026-07-07T00:00:00.000Z",
          userId: "user_1",
          workspaceId: "ws_1",
        },
        invoke,
      ),
    ).resolves.toEqual({ status: "saved" });

    expect(invoke).toHaveBeenCalledWith("save_api_session", {
      session: {
        token: "api_secret_token",
        expires_at: "2026-07-07T00:00:00.000Z",
        user_id: "user_1",
        workspace_id: "ws_1",
      },
    });
  });

  it("loads saved API sessions and normalizes native field names", async () => {
    const invoke = vi.fn().mockResolvedValue({
      token: "api_secret_token",
      expires_at: "2026-07-07T00:00:00.000Z",
      user_id: "user_1",
      workspace_id: "ws_1",
    });

    await expect(loadApiSession(invoke)).resolves.toEqual({
      token: "api_secret_token",
      expiresAt: "2026-07-07T00:00:00.000Z",
      userId: "user_1",
      workspaceId: "ws_1",
    });
  });

  it("returns null when no API session is stored", async () => {
    const invoke = vi.fn().mockResolvedValue(null);

    await expect(loadApiSession(invoke)).resolves.toBeNull();
  });

  it("clears API sessions through the native secure token command", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "cleared" });

    await expect(clearApiSession(invoke)).resolves.toEqual({ status: "cleared" });
    expect(invoke).toHaveBeenCalledWith("clear_api_session");
  });

  it("throws sanitized errors for invalid native responses", async () => {
    const invoke = vi.fn().mockResolvedValue({ token: "api_secret_token" });

    await expect(loadApiSession(invoke)).rejects.toThrow("secure_token_storage_invalid_response");
  });
});
