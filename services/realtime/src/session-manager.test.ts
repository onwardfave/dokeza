import { describe, expect, it, beforeEach } from "vitest";
import { SessionManager } from "./session-manager.js";
import { createTestActor } from "@dokeza/test-fixtures";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it("authenticates a valid actor and creates a session", () => {
    const actor = createTestActor({ workspaceId: "ws_1" });
    const result = manager.authenticate("conn_1", actor, "ws_1");

    expect("session" in result).toBe(true);
    if ("session" in result) {
      expect(result.session.workspaceId).toBe("ws_1");
      expect(result.session.state).toBe("active");
      expect(result.session.connectionId).toBe("conn_1");
      expect(result.telemetry.name).toBe("realtime.auth_accepted");
    }
  });

  it("rejects an actor without workspace membership", () => {
    const actor = createTestActor({ workspaceId: "ws_other" });
    const result = manager.authenticate("conn_1", actor, "ws_different");

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("auth_failed");
    }
  });

  it("rejects duplicate authentication on the same connection", () => {
    const actor = createTestActor({ workspaceId: "ws_1" });
    manager.authenticate("conn_1", actor, "ws_1");

    const result = manager.authenticate("conn_1", actor, "ws_1");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("already_authenticated");
    }
  });

  it("looks up session by connection ID", () => {
    const actor = createTestActor({ workspaceId: "ws_1" });
    const result = manager.authenticate("conn_1", actor, "ws_1");
    expect("session" in result).toBe(true);

    const session = manager.getSessionByConnection("conn_1");
    expect(session).toBeDefined();
    expect(session?.workspaceId).toBe("ws_1");
  });

  it("returns undefined for unknown connection", () => {
    expect(manager.getSessionByConnection("conn_unknown")).toBeUndefined();
  });

  it("advances client sequence numbers", () => {
    const actor = createTestActor({ workspaceId: "ws_1" });
    const result = manager.authenticate("conn_1", actor, "ws_1");
    if (!("session" in result)) throw new Error("Expected session");

    expect(manager.advanceClientSeq(result.session.sessionId, 1)).toBe(true);
    expect(manager.advanceClientSeq(result.session.sessionId, 5)).toBe(true);
    // Cannot go backwards
    expect(manager.advanceClientSeq(result.session.sessionId, 3)).toBe(false);
  });

  it("increments server sequence numbers", () => {
    const actor = createTestActor({ workspaceId: "ws_1" });
    const result = manager.authenticate("conn_1", actor, "ws_1");
    if (!("session" in result)) throw new Error("Expected session");

    expect(manager.nextServerSeq(result.session.sessionId)).toBe(1);
    expect(manager.nextServerSeq(result.session.sessionId)).toBe(2);
    expect(manager.nextServerSeq(result.session.sessionId)).toBe(3);
  });

  it("ends a session and emits telemetry", () => {
    const actor = createTestActor({ workspaceId: "ws_1" });
    const authResult = manager.authenticate("conn_1", actor, "ws_1");
    if (!("session" in authResult)) throw new Error("Expected session");

    const endResult = manager.endSession(authResult.session.sessionId, "user_stopped");
    expect("telemetry" in endResult).toBe(true);
    if ("telemetry" in endResult) {
      expect(endResult.telemetry.name).toBe("realtime.session_ended");
    }

    // Session is now ended
    const session = manager.getSession(authResult.session.sessionId);
    expect(session?.state).toBe("ended");
  });

  it("rejects ending an already-ended session", () => {
    const actor = createTestActor({ workspaceId: "ws_1" });
    const authResult = manager.authenticate("conn_1", actor, "ws_1");
    if (!("session" in authResult)) throw new Error("Expected session");

    manager.endSession(authResult.session.sessionId, "user_stopped");
    const result = manager.endSession(authResult.session.sessionId, "user_stopped");
    expect("error" in result).toBe(true);
  });

  it("marks a removed active connection as disconnected and resumable", () => {
    const actor = createTestActor({ workspaceId: "ws_1" });
    const authResult = manager.authenticate("conn_1", actor, "ws_1");
    if (!("session" in authResult)) throw new Error("Expected session");
    expect(manager.activeSessionCount).toBe(1);

    manager.removeConnection("conn_1");
    expect(manager.activeSessionCount).toBe(0);
    expect(manager.getSessionByConnection("conn_1")).toBeUndefined();
    expect(manager.getSession(authResult.session.sessionId)?.state).toBe("disconnected");
  });

  it("resumes a disconnected session on a new connection", () => {
    const actor = createTestActor({ userId: "user_1", workspaceId: "ws_1" });
    const authResult = manager.authenticate("conn_1", actor, "ws_1");
    if (!("session" in authResult)) throw new Error("Expected session");

    manager.advanceClientSeq(authResult.session.sessionId, 7);
    manager.nextServerSeq(authResult.session.sessionId);
    manager.nextServerSeq(authResult.session.sessionId);
    manager.removeConnection("conn_1");

    const result = manager.resumeSession({
      sessionId: authResult.session.sessionId,
      previousConnectionId: "conn_1",
      newConnectionId: "conn_2",
      actor,
      workspaceId: "ws_1",
      lastClientSeq: 8,
      lastServerSeq: 2,
    });

    expect("session" in result).toBe(true);
    if ("session" in result) {
      expect(result.session.sessionId).toBe(authResult.session.sessionId);
      expect(result.session.connectionId).toBe("conn_2");
      expect(result.session.state).toBe("active");
      expect(result.session.clientSeq).toBe(8);
      expect(result.session.serverSeq).toBe(2);
      expect(result.telemetry.name).toBe("realtime.session_resumed");
    }
    expect(manager.getSessionByConnection("conn_2")?.sessionId).toBe(authResult.session.sessionId);
  });

  it("removes the temporary authenticated session when resuming an existing session", () => {
    const actor = createTestActor({ userId: "user_1", workspaceId: "ws_1" });
    const original = manager.authenticate("conn_1", actor, "ws_1");
    if (!("session" in original)) throw new Error("Expected original session");
    manager.removeConnection("conn_1");

    const temporary = manager.authenticate("conn_2", actor, "ws_1");
    if (!("session" in temporary)) throw new Error("Expected temporary session");

    const result = manager.resumeSession({
      sessionId: original.session.sessionId,
      previousConnectionId: "conn_1",
      newConnectionId: "conn_2",
      actor,
      workspaceId: "ws_1",
      lastClientSeq: 2,
      lastServerSeq: 1,
    });

    expect("session" in result).toBe(true);
    expect(manager.getSession(temporary.session.sessionId)).toBeUndefined();
    expect(manager.getSessionByConnection("conn_2")?.sessionId).toBe(original.session.sessionId);
  });

  it("rejects resume for ended sessions", () => {
    const actor = createTestActor({ userId: "user_1", workspaceId: "ws_1" });
    const authResult = manager.authenticate("conn_1", actor, "ws_1");
    if (!("session" in authResult)) throw new Error("Expected session");

    manager.endSession(authResult.session.sessionId, "user_stopped");

    const result = manager.resumeSession({
      sessionId: authResult.session.sessionId,
      previousConnectionId: "conn_1",
      newConnectionId: "conn_2",
      actor,
      workspaceId: "ws_1",
      lastClientSeq: 2,
      lastServerSeq: 1,
    });

    expect(result).toEqual({ error: "session_not_resumable" });
  });

  it("rejects resume across workspace, user, or previous connection mismatches", () => {
    const actor = createTestActor({ userId: "user_1", workspaceId: "ws_1" });
    const authResult = manager.authenticate("conn_1", actor, "ws_1");
    if (!("session" in authResult)) throw new Error("Expected session");
    manager.removeConnection("conn_1");

    const baseInput = {
      sessionId: authResult.session.sessionId,
      previousConnectionId: "conn_1",
      newConnectionId: "conn_2",
      actor,
      workspaceId: "ws_1",
      lastClientSeq: 2,
      lastServerSeq: 1,
    };

    expect(
      manager.resumeSession({
        ...baseInput,
        actor: createTestActor({ userId: "user_2", workspaceId: "ws_1" }),
      }),
    ).toEqual({ error: "session_not_resumable" });

    expect(
      manager.resumeSession({
        ...baseInput,
        actor: createTestActor({ userId: "user_1", workspaceId: "ws_2" }),
        workspaceId: "ws_2",
      }),
    ).toEqual({ error: "session_not_resumable" });

    expect(
      manager.resumeSession({
        ...baseInput,
        previousConnectionId: "conn_other",
      }),
    ).toEqual({ error: "session_not_resumable" });
  });

  it("enforces workspace isolation across sessions", () => {
    const actor1 = createTestActor({ userId: "user_1", workspaceId: "ws_1" });
    const actor2 = createTestActor({ userId: "user_2", workspaceId: "ws_2" });

    const result1 = manager.authenticate("conn_1", actor1, "ws_1");
    const result2 = manager.authenticate("conn_2", actor2, "ws_2");

    expect("session" in result1).toBe(true);
    expect("session" in result2).toBe(true);

    if ("session" in result1 && "session" in result2) {
      expect(result1.session.workspaceId).toBe("ws_1");
      expect(result2.session.workspaceId).toBe("ws_2");
      expect(result1.session.sessionId).not.toBe(result2.session.sessionId);
    }

    // Actor1 cannot authenticate to ws_2
    const crossResult = manager.authenticate("conn_3", actor1, "ws_2");
    expect("error" in crossResult).toBe(true);
  });
});
