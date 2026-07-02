import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { createDokezaAuthTokenService, type DokezaAuthTokenService } from "@dokeza/auth";
import { authorizeWorkspace, type Actor, type WorkspaceRole } from "@dokeza/authz";
import { parseConfig, type DokezaConfig } from "@dokeza/config";
import {
  validateDevAuthTokenRequest,
  validateRealtimeTokenRequest,
  type DevAuthTokenRequest,
} from "@dokeza/contracts";
import { createHealthResponse } from "./index.js";

export interface HttpServerOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export interface HttpServerHandle {
  server: Server;
  close(): Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function methodNotAllowed(res: ServerResponse): void {
  sendJson(res, 405, { error: "method_not_allowed" });
}

function createAuthTokenService(config: DokezaConfig, now: () => Date): DokezaAuthTokenService {
  return createDokezaAuthTokenService({
    issuer: config.auth.issuer,
    audience: config.auth.audience,
    signingSecret: config.auth.signingSecret,
    now,
  });
}

function parseRuntimeConfig(
  env: NodeJS.ProcessEnv,
  now: () => Date,
): { config: DokezaConfig; tokenService: DokezaAuthTokenService } | undefined {
  const parsed = parseConfig(env, "api");
  if (!parsed.ok || parsed.config === undefined) {
    return undefined;
  }

  return {
    config: parsed.config,
    tokenService: createAuthTokenService(parsed.config, now),
  };
}

function readBearerToken(req: IncomingMessage): string | undefined {
  const value = req.headers.authorization;
  if (typeof value !== "string") {
    return undefined;
  }

  const [scheme, token] = value.split(" ");
  if (scheme !== "Bearer" || token === undefined || token.trim().length === 0) {
    return undefined;
  }

  return token;
}

function authenticateApiRequest(
  req: IncomingMessage,
  tokenService: DokezaAuthTokenService,
): { actor: Actor; developmentOnly: boolean } | { error: "auth_required" | "auth_invalid" } {
  const token = readBearerToken(req);
  if (token === undefined) {
    return { error: "auth_required" };
  }

  const validation = tokenService.validateToken(token, "api_access");
  if (!validation.ok) {
    return { error: "auth_invalid" };
  }

  return {
    actor: validation.principal.actor,
    developmentOnly: validation.principal.claims.development_only === true,
  };
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString("utf-8");
  if (text.trim().length === 0) {
    return {};
  }

  return JSON.parse(text) as unknown;
}

function createDevelopmentActor(input: DevAuthTokenRequest): Actor {
  const userId = input.user_id ?? "user_dev";
  const workspaceId = input.workspace_id ?? "ws_dev";
  const role: WorkspaceRole = input.role ?? "member";

  return {
    userId,
    memberships: [{ userId, workspaceId, role }],
  };
}

function expiresAt(now: Date, ttlSeconds: number): string {
  return new Date(now.getTime() + ttlSeconds * 1000).toISOString();
}

function workspaceName(workspaceId: string): string {
  return `Development Workspace ${workspaceId}`;
}

function handleHealth(req: IncomingMessage, res: ServerResponse, env: NodeJS.ProcessEnv): void {
  if (req.method !== "GET") {
    methodNotAllowed(res);
    return;
  }

  try {
    const health = createHealthResponse(env);
    sendJson(res, 200, health);
  } catch {
    sendJson(res, 503, { error: "service_unavailable" });
  }
}

export function createHttpServer(options: HttpServerOptions = {}): HttpServerHandle {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/health" || url.pathname === "/health/") {
      handleHealth(req, res, env);
      return;
    }

    const runtime = parseRuntimeConfig(env, now);
    if (runtime === undefined) {
      sendJson(res, 503, { error: "service_unavailable" });
      return;
    }

    if (url.pathname === "/v1/dev/auth/token") {
      if (req.method !== "POST") {
        methodNotAllowed(res);
        return;
      }

      if (!runtime.config.auth.developmentAuthEnabled) {
        sendJson(res, 403, { error: "dev_auth_unavailable" });
        return;
      }

      void readJsonBody(req)
        .then((body) => {
          if (!validateDevAuthTokenRequest(body)) {
            sendJson(res, 400, { error: "invalid_request" });
            return;
          }

          const actor = createDevelopmentActor(body);
          const token = runtime.tokenService.issueToken({
            actor,
            purpose: "api_access",
            expiresInSeconds: runtime.config.auth.apiTokenTtlSeconds,
            developmentOnly: true,
          });

          sendJson(res, 200, {
            token,
            token_type: "Bearer",
            expires_at: expiresAt(now(), runtime.config.auth.apiTokenTtlSeconds),
            user_id: actor.userId,
            development_only: true,
          });
        })
        .catch(() => sendJson(res, 400, { error: "invalid_request" }));
      return;
    }

    if (url.pathname === "/v1/me") {
      if (req.method !== "GET") {
        methodNotAllowed(res);
        return;
      }

      const auth = authenticateApiRequest(req, runtime.tokenService);
      if ("error" in auth) {
        sendJson(res, 401, { error: auth.error });
        return;
      }

      sendJson(res, 200, {
        user: {
          user_id: auth.actor.userId,
          display_name: auth.actor.userId,
          development_only: auth.developmentOnly,
        },
      });
      return;
    }

    if (url.pathname === "/v1/workspaces") {
      if (req.method !== "GET") {
        methodNotAllowed(res);
        return;
      }

      const auth = authenticateApiRequest(req, runtime.tokenService);
      if ("error" in auth) {
        sendJson(res, 401, { error: auth.error });
        return;
      }

      sendJson(res, 200, {
        workspaces: auth.actor.memberships
          .filter((membership) => membership.userId === auth.actor.userId)
          .map((membership) => ({
            workspace_id: membership.workspaceId,
            name: workspaceName(membership.workspaceId),
            role: membership.role,
          })),
      });
      return;
    }

    if (url.pathname === "/v1/realtime/token") {
      if (req.method !== "POST") {
        methodNotAllowed(res);
        return;
      }

      const auth = authenticateApiRequest(req, runtime.tokenService);
      if ("error" in auth) {
        sendJson(res, 401, { error: auth.error });
        return;
      }

      void readJsonBody(req)
        .then((body) => {
          if (!validateRealtimeTokenRequest(body)) {
            sendJson(res, 400, { error: "invalid_request" });
            return;
          }

          const authorization = authorizeWorkspace(auth.actor, body.workspace_id);
          if (!authorization.allowed) {
            sendJson(res, 403, { error: "workspace_access_denied" });
            return;
          }

          const token = runtime.tokenService.issueToken({
            actor: auth.actor,
            purpose: "realtime_session",
            workspaceId: body.workspace_id,
            expiresInSeconds: runtime.config.auth.realtimeTokenTtlSeconds,
            developmentOnly: auth.developmentOnly,
            ...(body.device_id === undefined ? {} : { deviceId: body.device_id }),
          });

          sendJson(res, 200, {
            token,
            token_type: "Bearer",
            expires_at: expiresAt(now(), runtime.config.auth.realtimeTokenTtlSeconds),
            workspace_id: body.workspace_id,
            development_only: auth.developmentOnly,
          });
        })
        .catch(() => sendJson(res, 400, { error: "invalid_request" }));
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}
