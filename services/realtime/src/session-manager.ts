import { authorizeWorkspace, type Actor } from "@dokeza/authz";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";

export type SessionState = "authenticating" | "active" | "ended";

export interface RealtimeSession {
  sessionId: string;
  connectionId: string;
  workspaceId: string;
  actor: Actor;
  state: SessionState;
  clientSeq: number;
  serverSeq: number;
  startedAt: string;
}

export interface SessionManagerOptions {
  maxSessionsPerConnection?: number;
}

export class SessionManager {
  private readonly sessions = new Map<string, RealtimeSession>();
  private readonly connectionToSession = new Map<string, string>();
  private readonly maxSessionsPerConnection: number;

  constructor(options: SessionManagerOptions = {}) {
    this.maxSessionsPerConnection = options.maxSessionsPerConnection ?? 1;
  }

  authenticate(
    connectionId: string,
    actor: Actor,
    workspaceId: string,
  ): { session: RealtimeSession; telemetry: TelemetryEvent } | { error: string } {
    const authorization = authorizeWorkspace(actor, workspaceId);
    if (!authorization.allowed) {
      return { error: `auth_failed:${authorization.reason}` };
    }

    const existing = this.connectionToSession.get(connectionId);
    if (existing !== undefined) {
      return { error: "auth_failed:already_authenticated" };
    }

    const sessionId = `sess_${connectionId}_${Date.now()}`;
    const session: RealtimeSession = {
      sessionId,
      connectionId,
      workspaceId,
      actor,
      state: "active",
      clientSeq: 0,
      serverSeq: 0,
      startedAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    this.connectionToSession.set(connectionId, sessionId);

    return {
      session,
      telemetry: createTelemetryEvent("realtime.auth_accepted", {
        connectionId,
        sessionId,
        workspaceId,
        role: authorization.role ?? "unknown",
      }),
    };
  }

  getSessionByConnection(connectionId: string): RealtimeSession | undefined {
    const sessionId = this.connectionToSession.get(connectionId);
    if (sessionId === undefined) return undefined;
    return this.sessions.get(sessionId);
  }

  getSession(sessionId: string): RealtimeSession | undefined {
    return this.sessions.get(sessionId);
  }

  advanceClientSeq(sessionId: string, seq: number): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined || session.state !== "active") return false;
    if (seq <= session.clientSeq) return false;
    session.clientSeq = seq;
    return true;
  }

  nextServerSeq(sessionId: string): number | undefined {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return undefined;
    session.serverSeq += 1;
    return session.serverSeq;
  }

  endSession(sessionId: string, reason: string): { telemetry: TelemetryEvent } | { error: string } {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return { error: "session_not_found" };
    }
    if (session.state === "ended") {
      return { error: "session_already_ended" };
    }

    session.state = "ended";
    this.connectionToSession.delete(session.connectionId);

    return {
      telemetry: createTelemetryEvent("realtime.session_ended", {
        sessionId,
        connectionId: session.connectionId,
        workspaceId: session.workspaceId,
        reason,
        finalClientSeq: session.clientSeq,
        finalServerSeq: session.serverSeq,
      }),
    };
  }

  removeConnection(connectionId: string): void {
    const sessionId = this.connectionToSession.get(connectionId);
    if (sessionId !== undefined) {
      const session = this.sessions.get(sessionId);
      if (session !== undefined && session.state === "active") {
        session.state = "ended";
      }
      this.connectionToSession.delete(connectionId);
    }
  }

  get activeSessionCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.state === "active") count += 1;
    }
    return count;
  }
}
