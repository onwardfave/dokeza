import { authorizeWorkspace, type Actor } from "@dokeza/authz";
import { parseConfig, type DokezaConfig } from "@dokeza/config";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";

export interface HealthResponse {
  service: "api";
  status: "ok";
  environment: DokezaConfig["environment"];
}

export interface WorkspaceRequestContext {
  workspaceId: string;
  actorUserId: string;
  authorized: true;
  telemetry: TelemetryEvent;
}

export function createHealthResponse(env: NodeJS.ProcessEnv = process.env): HealthResponse {
  const parsed = parseConfig(env, "api");
  if (!parsed.ok || parsed.config === undefined) {
    throw new Error("api_config_invalid");
  }

  return {
    service: "api",
    status: "ok",
    environment: parsed.config.environment,
  };
}

export function createWorkspaceRequestContext(
  actor: Actor,
  workspaceId: string,
): WorkspaceRequestContext {
  const authorization = authorizeWorkspace(actor, workspaceId);
  if (!authorization.allowed) {
    throw new Error(`workspace_access_denied:${authorization.reason}`);
  }

  return {
    workspaceId,
    actorUserId: actor.userId,
    authorized: true,
    telemetry: createTelemetryEvent("api.workspace_authorized", {
      workspaceId,
      userId: actor.userId,
      role: authorization.role ?? "unknown",
    }),
  };
}
