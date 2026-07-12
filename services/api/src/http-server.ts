import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createDokezaAuthTokenService,
  OidcJwtProviderVerifier,
  type DokezaAuthTokenService,
  type ProviderTokenValidationResult,
} from "@dokeza/auth";
import { authorizeWorkspace, type Actor, type WorkspaceRole } from "@dokeza/authz";
import { parseConfig, type DokezaConfig } from "@dokeza/config";
import { createTelemetryEvent, type TelemetryEvent } from "@dokeza/telemetry";
import {
  validateDevAuthTokenRequest,
  validateKnowledgeDocumentUploadRequest,
  validateProviderAuthExchangeRequest,
  validateRealtimeTokenRequest,
  validateWorkspaceMembershipUpsertRequest,
  type DevAuthTokenRequest,
} from "@dokeza/contracts";
import {
  createKnowledgePersistenceFromConfig,
  KnowledgeRepositoryError,
  type KnowledgePersistence,
  type KnowledgeRepository,
} from "@dokeza/knowledge";
import { createHealthResponse } from "./index.js";
import {
  createMeetingReviewPersistenceFromConfig,
  type MeetingExportFormat,
  type MeetingReviewPersistence,
  type MeetingReviewRepository,
} from "./meeting-review-repository.js";
import {
  createIdentityPersistenceFromConfig,
  MembershipMutationError,
  type IdentityPersistence,
  type IdentityRepository,
} from "./identity-repository.js";

export interface ProviderVerifier {
  verify(token: string): Promise<ProviderTokenValidationResult>;
}

export interface HttpServerOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  meetingRepository?: MeetingReviewRepository;
  knowledgeRepository?: KnowledgeRepository;
  identityRepository?: IdentityRepository;
  providerVerifier?: ProviderVerifier;
  telemetrySink?: TelemetrySink;
}

export interface HttpServerHandle {
  server: Server;
  close(): Promise<void>;
}

export interface TelemetrySink {
  emit(event: TelemetryEvent): void | Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function sendMembershipMutationError(
  res: ServerResponse,
  error: unknown,
  fallbackStatus: number,
): void {
  if (error instanceof MembershipMutationError) {
    const status = error.code === "last_workspace_owner" ? 409 : 403;
    sendJson(res, status, { error: error.code });
    return;
  }
  sendJson(res, fallbackStatus, {
    error: fallbackStatus === 400 ? "invalid_request" : "service_unavailable",
  });
}

function statusCategory(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

function emitTelemetry(sink: TelemetrySink, event: TelemetryEvent): void {
  try {
    void sink.emit(event);
  } catch {
    // Auth telemetry must never block or alter auth behavior.
  }
}

function createAuthTelemetry(input: {
  route: string;
  method: string | undefined;
  status: number;
  startedAtMs: number;
  nowMs: number;
  environment: DokezaConfig["environment"];
  developmentOnly?: boolean;
  failureCategory?: string;
  userId?: string;
  workspaceId?: string;
}): TelemetryEvent {
  return createTelemetryEvent("api.auth_request", {
    route: input.route,
    method: input.method ?? "UNKNOWN",
    status: input.status,
    statusCategory: statusCategory(input.status),
    latencyMs: Math.max(0, input.nowMs - input.startedAtMs),
    environment: input.environment,
    ...(input.developmentOnly === undefined ? {} : { developmentOnly: input.developmentOnly }),
    ...(input.failureCategory === undefined ? {} : { failureCategory: input.failureCategory }),
    ...(input.userId === undefined ? {} : { userId: input.userId }),
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
  });
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

function workspaceDisplayName(workspaceId: string, developmentOnly: boolean): string {
  return developmentOnly ? workspaceName(workspaceId) : workspaceId;
}

interface MeetingRouteMatch {
  workspaceId: string;
  meetingId?: string;
  action?: "export";
}

interface KnowledgeRouteMatch {
  workspaceId: string;
  documentId?: string;
  action?: "search";
}

interface WorkspaceMembershipRouteMatch {
  workspaceId: string;
  userId?: string;
}

function matchMeetingRoute(pathname: string): MeetingRouteMatch | undefined {
  const parts = pathname.split("/").filter((part) => part.length > 0);
  if (parts[0] !== "v1" || parts[1] !== "workspaces" || parts[3] !== "meetings") {
    return undefined;
  }

  const workspaceId = decodeURIComponent(parts[2] ?? "");
  if (workspaceId.length === 0 || parts.length > 6) {
    return undefined;
  }

  if (parts.length === 4) {
    return { workspaceId };
  }

  const meetingId = decodeURIComponent(parts[4] ?? "");
  if (meetingId.length === 0) {
    return undefined;
  }

  if (parts.length === 5) {
    return { workspaceId, meetingId };
  }

  if (parts.length === 6 && parts[5] === "export") {
    return { workspaceId, meetingId, action: "export" };
  }

  return undefined;
}

function matchKnowledgeRoute(pathname: string): KnowledgeRouteMatch | undefined {
  const parts = pathname.split("/").filter((part) => part.length > 0);
  if (parts[0] !== "v1" || parts[1] !== "workspaces") {
    return undefined;
  }

  const workspaceId = decodeURIComponent(parts[2] ?? "");
  if (workspaceId.length === 0) {
    return undefined;
  }

  if (parts[3] === "documents") {
    if (parts.length === 4) {
      return { workspaceId };
    }

    if (parts.length === 5) {
      const documentId = decodeURIComponent(parts[4] ?? "");
      return documentId.length === 0 ? undefined : { workspaceId, documentId };
    }

    return undefined;
  }

  if (parts[3] === "knowledge" && parts[4] === "search" && parts.length === 5) {
    return { workspaceId, action: "search" };
  }

  return undefined;
}

function matchWorkspaceMembershipRoute(
  pathname: string,
): WorkspaceMembershipRouteMatch | undefined {
  const parts = pathname.split("/").filter((part) => part.length > 0);
  if (parts[0] !== "v1" || parts[1] !== "workspaces" || parts[3] !== "memberships") {
    return undefined;
  }

  const workspaceId = decodeURIComponent(parts[2] ?? "");
  if (workspaceId.length === 0 || parts.length > 5) {
    return undefined;
  }

  if (parts.length === 4) {
    return { workspaceId };
  }

  const userId = decodeURIComponent(parts[4] ?? "");
  return userId.length === 0 ? undefined : { workspaceId, userId };
}

function readMeetingExportFormat(url: URL): MeetingExportFormat | undefined {
  const format = url.searchParams.get("format") ?? "markdown";
  return format === "markdown" || format === "json" ? format : undefined;
}

function readTopK(url: URL): number | undefined {
  const raw = url.searchParams.get("top_k");
  if (raw === null) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readMeetingSearchQuery(url: URL): string | undefined {
  const query = url.searchParams.get("q")?.trim();
  return query === undefined || query.length === 0 ? undefined : query;
}

function sendKnowledgeError(res: ServerResponse, err: unknown): void {
  if (err instanceof KnowledgeRepositoryError) {
    sendJson(res, err.code === "invalid_request" ? 400 : 403, { error: err.code });
    return;
  }

  sendJson(res, 503, { error: "service_unavailable" });
}

function createProviderVerifier(config: DokezaConfig): ProviderVerifier | undefined {
  if (!config.auth.hostedProvider.enabled) {
    return undefined;
  }
  const { issuer, audience, jwksUrl } = config.auth.hostedProvider;
  if (issuer === undefined || audience === undefined || jwksUrl === undefined) {
    return undefined;
  }

  return new OidcJwtProviderVerifier({
    issuer,
    audience,
    jwksUrl,
  });
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
  const telemetrySink = options.telemetrySink ?? { emit: () => undefined };
  let managedMeetingPersistence: MeetingReviewPersistence | undefined;
  let managedKnowledgePersistence: KnowledgePersistence | undefined;
  let managedIdentityPersistence: IdentityPersistence | undefined;

  function emitAuthTelemetry(
    runtime: { config: DokezaConfig },
    input: Omit<Parameters<typeof createAuthTelemetry>[0], "environment" | "nowMs">,
  ): void {
    emitTelemetry(
      telemetrySink,
      createAuthTelemetry({
        ...input,
        nowMs: now().getTime(),
        environment: runtime.config.environment,
      }),
    );
  }

  function getIdentityRepository(config: DokezaConfig): IdentityRepository {
    if (options.identityRepository !== undefined) {
      return options.identityRepository;
    }

    if (managedIdentityPersistence === undefined) {
      managedIdentityPersistence = createIdentityPersistenceFromConfig(config);
    }

    return managedIdentityPersistence.repository;
  }

  function getMeetingRepository(config: DokezaConfig): MeetingReviewRepository {
    if (options.meetingRepository !== undefined) {
      return options.meetingRepository;
    }

    if (managedMeetingPersistence === undefined) {
      managedMeetingPersistence = createMeetingReviewPersistenceFromConfig(config);
    }

    return managedMeetingPersistence.repository;
  }

  function getKnowledgeRepository(config: DokezaConfig): KnowledgeRepository {
    if (options.knowledgeRepository !== undefined) {
      return options.knowledgeRepository;
    }

    if (managedKnowledgePersistence === undefined) {
      managedKnowledgePersistence = createKnowledgePersistenceFromConfig(config);
    }

    return managedKnowledgePersistence.repository;
  }

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
      const startedAtMs = now().getTime();
      if (req.method !== "POST") {
        emitAuthTelemetry(runtime, {
          route: "dev_auth_token",
          method: req.method,
          status: 405,
          startedAtMs,
          failureCategory: "method_not_allowed",
        });
        methodNotAllowed(res);
        return;
      }

      if (!runtime.config.auth.developmentAuthEnabled) {
        emitAuthTelemetry(runtime, {
          route: "dev_auth_token",
          method: req.method,
          status: 403,
          startedAtMs,
          failureCategory: "dev_auth_unavailable",
        });
        sendJson(res, 403, { error: "dev_auth_unavailable" });
        return;
      }

      void readJsonBody(req)
        .then((body) => {
          if (!validateDevAuthTokenRequest(body)) {
            emitAuthTelemetry(runtime, {
              route: "dev_auth_token",
              method: req.method,
              status: 400,
              startedAtMs,
              failureCategory: "invalid_request",
            });
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

          emitAuthTelemetry(runtime, {
            route: "dev_auth_token",
            method: req.method,
            status: 200,
            startedAtMs,
            developmentOnly: true,
            userId: actor.userId,
          });

          sendJson(res, 200, {
            token,
            token_type: "Bearer",
            expires_at: expiresAt(now(), runtime.config.auth.apiTokenTtlSeconds),
            user_id: actor.userId,
            development_only: true,
          });
        })
        .catch(() => {
          emitAuthTelemetry(runtime, {
            route: "dev_auth_token",
            method: req.method,
            status: 400,
            startedAtMs,
            failureCategory: "invalid_request",
          });
          sendJson(res, 400, { error: "invalid_request" });
        });
      return;
    }

    if (url.pathname === "/v1/auth/provider/exchange") {
      const startedAtMs = now().getTime();
      if (req.method !== "POST") {
        emitAuthTelemetry(runtime, {
          route: "provider_exchange",
          method: req.method,
          status: 405,
          startedAtMs,
          failureCategory: "method_not_allowed",
        });
        methodNotAllowed(res);
        return;
      }

      const providerVerifier = options.providerVerifier ?? createProviderVerifier(runtime.config);
      if (providerVerifier === undefined) {
        emitAuthTelemetry(runtime, {
          route: "provider_exchange",
          method: req.method,
          status: 403,
          startedAtMs,
          failureCategory: "auth_provider_unavailable",
        });
        sendJson(res, 403, { error: "auth_provider_unavailable" });
        return;
      }

      void readJsonBody(req)
        .then(async (body) => {
          if (!validateProviderAuthExchangeRequest(body)) {
            emitAuthTelemetry(runtime, {
              route: "provider_exchange",
              method: req.method,
              status: 400,
              startedAtMs,
              failureCategory: "invalid_request",
            });
            sendJson(res, 400, { error: "invalid_request" });
            return;
          }

          const providerValidation = await providerVerifier.verify(body.provider_token);
          if (!providerValidation.ok) {
            emitAuthTelemetry(runtime, {
              route: "provider_exchange",
              method: req.method,
              status: 401,
              startedAtMs,
              failureCategory: providerValidation.reason,
            });
            sendJson(res, 401, { error: "auth_invalid" });
            return;
          }

          const identityRepository = getIdentityRepository(runtime.config);
          const principal = await identityRepository.resolveProviderIdentity(
            providerValidation.identity,
          );
          const token = runtime.tokenService.issueToken({
            actor: principal.actor,
            purpose: "api_access",
            expiresInSeconds: runtime.config.auth.apiTokenTtlSeconds,
            developmentOnly: false,
            ...(body.device_id === undefined ? {} : { deviceId: body.device_id }),
          });

          emitAuthTelemetry(runtime, {
            route: "provider_exchange",
            method: req.method,
            status: 200,
            startedAtMs,
            developmentOnly: false,
            userId: principal.actor.userId,
          });

          sendJson(res, 200, {
            token,
            token_type: "Bearer",
            expires_at: expiresAt(now(), runtime.config.auth.apiTokenTtlSeconds),
            user: {
              user_id: principal.actor.userId,
              display_name: principal.displayName,
              development_only: false,
            },
            workspaces: principal.actor.memberships
              .filter((membership) => membership.userId === principal.actor.userId)
              .map((membership) => ({
                workspace_id: membership.workspaceId,
                name: workspaceDisplayName(membership.workspaceId, false),
                role: membership.role,
              })),
          });
        })
        .catch(() => {
          emitAuthTelemetry(runtime, {
            route: "provider_exchange",
            method: req.method,
            status: 400,
            startedAtMs,
            failureCategory: "invalid_request",
          });
          sendJson(res, 400, { error: "invalid_request" });
        });
      return;
    }

    if (url.pathname === "/v1/me") {
      const startedAtMs = now().getTime();
      if (req.method !== "GET") {
        emitAuthTelemetry(runtime, {
          route: "profile",
          method: req.method,
          status: 405,
          startedAtMs,
          failureCategory: "method_not_allowed",
        });
        methodNotAllowed(res);
        return;
      }

      const auth = authenticateApiRequest(req, runtime.tokenService);
      if ("error" in auth) {
        emitAuthTelemetry(runtime, {
          route: "profile",
          method: req.method,
          status: 401,
          startedAtMs,
          failureCategory: auth.error,
        });
        sendJson(res, 401, { error: auth.error });
        return;
      }

      emitAuthTelemetry(runtime, {
        route: "profile",
        method: req.method,
        status: 200,
        startedAtMs,
        developmentOnly: auth.developmentOnly,
        userId: auth.actor.userId,
      });

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
      const startedAtMs = now().getTime();
      if (req.method !== "GET") {
        emitAuthTelemetry(runtime, {
          route: "workspace_list",
          method: req.method,
          status: 405,
          startedAtMs,
          failureCategory: "method_not_allowed",
        });
        methodNotAllowed(res);
        return;
      }

      const auth = authenticateApiRequest(req, runtime.tokenService);
      if ("error" in auth) {
        emitAuthTelemetry(runtime, {
          route: "workspace_list",
          method: req.method,
          status: 401,
          startedAtMs,
          failureCategory: auth.error,
        });
        sendJson(res, 401, { error: auth.error });
        return;
      }

      emitAuthTelemetry(runtime, {
        route: "workspace_list",
        method: req.method,
        status: 200,
        startedAtMs,
        developmentOnly: auth.developmentOnly,
        userId: auth.actor.userId,
      });

      sendJson(res, 200, {
        workspaces: auth.actor.memberships
          .filter((membership) => membership.userId === auth.actor.userId)
          .map((membership) => ({
            workspace_id: membership.workspaceId,
            name: workspaceDisplayName(membership.workspaceId, auth.developmentOnly),
            role: membership.role,
          })),
      });
      return;
    }

    if (url.pathname === "/v1/realtime/token") {
      const startedAtMs = now().getTime();
      if (req.method !== "POST") {
        emitAuthTelemetry(runtime, {
          route: "realtime_token",
          method: req.method,
          status: 405,
          startedAtMs,
          failureCategory: "method_not_allowed",
        });
        methodNotAllowed(res);
        return;
      }

      const auth = authenticateApiRequest(req, runtime.tokenService);
      if ("error" in auth) {
        emitAuthTelemetry(runtime, {
          route: "realtime_token",
          method: req.method,
          status: 401,
          startedAtMs,
          failureCategory: auth.error,
        });
        sendJson(res, 401, { error: auth.error });
        return;
      }

      void readJsonBody(req)
        .then((body) => {
          if (!validateRealtimeTokenRequest(body)) {
            emitAuthTelemetry(runtime, {
              route: "realtime_token",
              method: req.method,
              status: 400,
              startedAtMs,
              developmentOnly: auth.developmentOnly,
              failureCategory: "invalid_request",
              userId: auth.actor.userId,
            });
            sendJson(res, 400, { error: "invalid_request" });
            return;
          }

          const authorization = authorizeWorkspace(auth.actor, body.workspace_id);
          if (!authorization.allowed) {
            emitAuthTelemetry(runtime, {
              route: "realtime_token",
              method: req.method,
              status: 403,
              startedAtMs,
              developmentOnly: auth.developmentOnly,
              failureCategory: "workspace_access_denied",
              userId: auth.actor.userId,
              workspaceId: body.workspace_id,
            });
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

          emitAuthTelemetry(runtime, {
            route: "realtime_token",
            method: req.method,
            status: 200,
            startedAtMs,
            developmentOnly: auth.developmentOnly,
            userId: auth.actor.userId,
            workspaceId: body.workspace_id,
          });

          sendJson(res, 200, {
            token,
            token_type: "Bearer",
            expires_at: expiresAt(now(), runtime.config.auth.realtimeTokenTtlSeconds),
            workspace_id: body.workspace_id,
            development_only: auth.developmentOnly,
          });
        })
        .catch(() => {
          emitAuthTelemetry(runtime, {
            route: "realtime_token",
            method: req.method,
            status: 400,
            startedAtMs,
            developmentOnly: auth.developmentOnly,
            failureCategory: "invalid_request",
            userId: auth.actor.userId,
          });
          sendJson(res, 400, { error: "invalid_request" });
        });
      return;
    }

    const membershipRoute = matchWorkspaceMembershipRoute(url.pathname);
    if (membershipRoute !== undefined) {
      const auth = authenticateApiRequest(req, runtime.tokenService);
      if ("error" in auth) {
        sendJson(res, 401, { error: auth.error });
        return;
      }

      const authorization = authorizeWorkspace(auth.actor, membershipRoute.workspaceId, "admin");
      if (!authorization.allowed) {
        sendJson(res, 403, { error: "workspace_access_denied" });
        return;
      }

      const identityRepository = getIdentityRepository(runtime.config);

      if (membershipRoute.userId === undefined) {
        if (req.method === "GET") {
          void identityRepository
            .listWorkspaceMemberships(membershipRoute.workspaceId)
            .then((memberships) =>
              sendJson(res, 200, {
                workspace_id: membershipRoute.workspaceId,
                memberships: memberships.map((membership) => ({
                  user_id: membership.userId,
                  ...(membership.email === undefined ? {} : { email: membership.email }),
                  ...(membership.displayName === undefined
                    ? {}
                    : { display_name: membership.displayName }),
                  role: membership.role,
                })),
              }),
            )
            .catch(() => sendJson(res, 503, { error: "service_unavailable" }));
          return;
        }

        if (req.method === "PUT") {
          void readJsonBody(req)
            .then((body) => {
              if (!validateWorkspaceMembershipUpsertRequest(body)) {
                sendJson(res, 400, { error: "invalid_request" });
                return;
              }

              return identityRepository
                .upsertWorkspaceMembership({
                  workspaceId: membershipRoute.workspaceId,
                  actorUserId: auth.actor.userId,
                  userId: body.user_id,
                  email: body.email,
                  role: body.role,
                  ...(body.display_name === undefined ? {} : { displayName: body.display_name }),
                })
                .then((membership) =>
                  sendJson(res, 200, {
                    workspace_id: membershipRoute.workspaceId,
                    membership: {
                      user_id: membership.userId,
                      ...(membership.email === undefined ? {} : { email: membership.email }),
                      ...(membership.displayName === undefined
                        ? {}
                        : { display_name: membership.displayName }),
                      role: membership.role,
                    },
                  }),
                );
            })
            .catch((error: unknown) => sendMembershipMutationError(res, error, 400));
          return;
        }

        methodNotAllowed(res);
        return;
      }

      if (req.method === "DELETE") {
        void identityRepository
          .deleteWorkspaceMembership({
            workspaceId: membershipRoute.workspaceId,
            actorUserId: auth.actor.userId,
            userId: membershipRoute.userId,
          })
          .then((deleted) =>
            sendJson(res, 200, {
              workspace_id: membershipRoute.workspaceId,
              user_id: membershipRoute.userId,
              deleted,
            }),
          )
          .catch((error: unknown) => sendMembershipMutationError(res, error, 503));
        return;
      }

      methodNotAllowed(res);
      return;
    }

    const knowledgeRoute = matchKnowledgeRoute(url.pathname);
    if (knowledgeRoute !== undefined) {
      const auth = authenticateApiRequest(req, runtime.tokenService);
      if ("error" in auth) {
        sendJson(res, 401, { error: auth.error });
        return;
      }

      const authorization = authorizeWorkspace(auth.actor, knowledgeRoute.workspaceId);
      if (!authorization.allowed) {
        sendJson(res, 403, { error: "workspace_access_denied" });
        return;
      }

      const knowledgeRepository = getKnowledgeRepository(runtime.config);

      if (knowledgeRoute.action === "search") {
        if (req.method !== "GET") {
          methodNotAllowed(res);
          return;
        }

        const query = url.searchParams.get("q")?.trim();
        if (query === undefined || query.length === 0) {
          sendJson(res, 400, { error: "invalid_request" });
          return;
        }

        const topK = readTopK(url);
        const searchInput =
          topK === undefined
            ? { workspaceId: knowledgeRoute.workspaceId, query }
            : { workspaceId: knowledgeRoute.workspaceId, query, topK };

        void knowledgeRepository
          .search(searchInput)
          .then((body) => sendJson(res, 200, body))
          .catch((err: unknown) => sendKnowledgeError(res, err));
        return;
      }

      if (knowledgeRoute.documentId === undefined) {
        if (req.method === "GET") {
          void knowledgeRepository
            .listDocuments(knowledgeRoute.workspaceId)
            .then((body) => sendJson(res, 200, body))
            .catch((err: unknown) => sendKnowledgeError(res, err));
          return;
        }

        if (req.method === "POST") {
          void readJsonBody(req)
            .then((body) => {
              if (!validateKnowledgeDocumentUploadRequest(body)) {
                sendJson(res, 400, { error: "invalid_request" });
                return;
              }

              return knowledgeRepository
                .uploadDocument({
                  workspaceId: knowledgeRoute.workspaceId,
                  actorUserId: auth.actor.userId,
                  title: body.title,
                  source: body.source,
                  text: body.text,
                  ...(body.permission_tags === undefined
                    ? {}
                    : { permissionTags: body.permission_tags }),
                })
                .then((created) => sendJson(res, 201, created));
            })
            .catch((err: unknown) => sendKnowledgeError(res, err));
          return;
        }

        methodNotAllowed(res);
        return;
      }

      if (req.method === "GET") {
        void knowledgeRepository
          .getDocumentDetail(knowledgeRoute.workspaceId, knowledgeRoute.documentId)
          .then((body) => {
            if (body === undefined) {
              sendJson(res, 404, { error: "document_not_found" });
              return;
            }

            sendJson(res, 200, body);
          })
          .catch((err: unknown) => sendKnowledgeError(res, err));
        return;
      }

      methodNotAllowed(res);
      return;
    }

    const meetingRoute = matchMeetingRoute(url.pathname);
    if (meetingRoute !== undefined) {
      const auth = authenticateApiRequest(req, runtime.tokenService);
      if ("error" in auth) {
        sendJson(res, 401, { error: auth.error });
        return;
      }

      const authorization = authorizeWorkspace(auth.actor, meetingRoute.workspaceId);
      if (!authorization.allowed) {
        sendJson(res, 403, { error: "workspace_access_denied" });
        return;
      }

      if (meetingRoute.meetingId === undefined) {
        if (req.method !== "GET") {
          methodNotAllowed(res);
          return;
        }

        const transcriptQuery = readMeetingSearchQuery(url);
        const listOptions =
          transcriptQuery === undefined
            ? {}
            : {
                transcriptQuery,
              };
        const meetingRepository = getMeetingRepository(runtime.config);
        void meetingRepository
          .listMeetings(meetingRoute.workspaceId, listOptions)
          .then((body) => sendJson(res, 200, body))
          .catch(() => sendJson(res, 503, { error: "service_unavailable" }));
        return;
      }

      if (meetingRoute.action === "export") {
        if (req.method !== "GET") {
          methodNotAllowed(res);
          return;
        }

        const format = readMeetingExportFormat(url);
        if (format === undefined) {
          sendJson(res, 400, { error: "invalid_request" });
          return;
        }

        const meetingRepository = getMeetingRepository(runtime.config);
        void meetingRepository
          .exportMeeting(meetingRoute.workspaceId, meetingRoute.meetingId, format)
          .then((body) => {
            if (body === undefined) {
              sendJson(res, 404, { error: "meeting_not_found" });
              return;
            }

            sendJson(res, 200, body);
          })
          .catch(() => sendJson(res, 503, { error: "service_unavailable" }));
        return;
      }

      if (req.method === "GET") {
        const meetingRepository = getMeetingRepository(runtime.config);
        void meetingRepository
          .getMeetingDetail(meetingRoute.workspaceId, meetingRoute.meetingId)
          .then((body) => {
            if (body === undefined) {
              sendJson(res, 404, { error: "meeting_not_found" });
              return;
            }

            sendJson(res, 200, body);
          })
          .catch(() => sendJson(res, 503, { error: "service_unavailable" }));
        return;
      }

      if (req.method === "DELETE") {
        const meetingRepository = getMeetingRepository(runtime.config);
        void meetingRepository
          .deleteMeeting(meetingRoute.workspaceId, meetingRoute.meetingId)
          .then((body) => {
            if (body === undefined) {
              sendJson(res, 404, { error: "meeting_not_found" });
              return;
            }

            sendJson(res, 200, body);
          })
          .catch(() => sendJson(res, 503, { error: "service_unavailable" }));
        return;
      }

      methodNotAllowed(res);
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  });

  return {
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }

          void Promise.all([
            managedMeetingPersistence?.close() ?? Promise.resolve(),
            managedKnowledgePersistence?.close() ?? Promise.resolve(),
            managedIdentityPersistence?.close() ?? Promise.resolve(),
          ])
            .then(() => resolve())
            .catch(reject);
        });
      }),
  };
}
