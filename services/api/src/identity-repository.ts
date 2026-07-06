import type { ProviderIdentity } from "@dokeza/auth";
import type { Actor, WorkspaceMembership, WorkspaceRole } from "@dokeza/authz";
import {
  closePool,
  createDatabase,
  createPool,
  userProviderIdentities,
  users,
  workspaceMemberships,
  workspaces,
  type Database,
} from "@dokeza/db";
import type { DokezaConfig } from "@dokeza/config";
import { and, eq } from "drizzle-orm";

export interface IdentityPrincipal {
  actor: Actor;
  displayName: string;
  email?: string;
}

export interface IdentityRecord {
  providerSubject: string;
  userId: string;
  displayName: string;
  memberships: WorkspaceMembership[];
  email?: string;
}

export interface IdentityRepository {
  resolveProviderIdentity(identity: ProviderIdentity): Promise<IdentityPrincipal>;
}

export interface PgIdentityRepositoryOptions {
  db: Database;
  providerIssuer: string;
}

export class PgIdentityRepository implements IdentityRepository {
  private readonly db: Database;
  private readonly providerIssuer: string;

  constructor(options: PgIdentityRepositoryOptions) {
    this.db = options.db;
    this.providerIssuer = options.providerIssuer;
  }

  async resolveProviderIdentity(identity: ProviderIdentity): Promise<IdentityPrincipal> {
    const displayName = identity.displayName ?? identity.email ?? identity.providerSubject;

    return this.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const existingRows = await db
        .select({
          userId: userProviderIdentities.userId,
          email: users.email,
          displayName: users.displayName,
        })
        .from(userProviderIdentities)
        .innerJoin(users, eq(users.id, userProviderIdentities.userId))
        .where(
          and(
            eq(userProviderIdentities.providerIssuer, this.providerIssuer),
            eq(userProviderIdentities.providerSubject, identity.providerSubject),
          ),
        )
        .limit(1);

      const userId =
        existingRows[0]?.userId ?? `user_${stableIdentityPart(identity.providerSubject)}`;
      const effectiveEmail = identity.email ?? existingRows[0]?.email ?? `${userId}@identity.local`;
      const effectiveDisplayName = displayName;

      if (existingRows.length === 0) {
        const workspaceId = `ws_${stableIdentityPart(identity.providerSubject)}`;
        await db
          .insert(users)
          .values({
            id: userId,
            email: effectiveEmail,
            displayName: effectiveDisplayName,
          })
          .onConflictDoNothing();
        await db
          .insert(workspaces)
          .values({
            id: workspaceId,
            name: `${effectiveDisplayName} Workspace`,
            plan: "individual",
          })
          .onConflictDoNothing();
        await db
          .insert(workspaceMemberships)
          .values({
            workspaceId,
            userId,
            role: "owner",
          })
          .onConflictDoNothing();
        await db.insert(userProviderIdentities).values({
          providerIssuer: this.providerIssuer,
          providerSubject: identity.providerSubject,
          userId,
          email: identity.email ?? null,
          displayName: identity.displayName ?? null,
        });
      } else {
        await db
          .update(users)
          .set({
            email: effectiveEmail,
            displayName: effectiveDisplayName,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
        await db
          .update(userProviderIdentities)
          .set({
            email: identity.email ?? null,
            displayName: identity.displayName ?? null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userProviderIdentities.providerIssuer, this.providerIssuer),
              eq(userProviderIdentities.providerSubject, identity.providerSubject),
            ),
          );
      }

      const memberships = await db
        .select({
          userId: workspaceMemberships.userId,
          workspaceId: workspaceMemberships.workspaceId,
          role: workspaceMemberships.role,
        })
        .from(workspaceMemberships)
        .where(eq(workspaceMemberships.userId, userId));

      return {
        actor: {
          userId,
          memberships: memberships.map((membership) => ({
            userId: membership.userId,
            workspaceId: membership.workspaceId,
            role: membership.role as WorkspaceRole,
          })),
        },
        displayName: effectiveDisplayName,
        email: effectiveEmail,
      };
    });
  }
}

export class InMemoryIdentityRepository implements IdentityRepository {
  private readonly recordsByProviderSubject = new Map<string, IdentityRecord>();

  constructor(records: IdentityRecord[] = []) {
    for (const record of records) {
      this.recordsByProviderSubject.set(record.providerSubject, record);
    }
  }

  async resolveProviderIdentity(identity: ProviderIdentity): Promise<IdentityPrincipal> {
    const existing = this.recordsByProviderSubject.get(identity.providerSubject);
    if (existing !== undefined) {
      return toPrincipal(existing);
    }

    const userId = `user_${stableIdentityPart(identity.providerSubject)}`;
    const workspaceId = `ws_${stableIdentityPart(identity.providerSubject)}`;
    const role: WorkspaceRole = "owner";
    const record: IdentityRecord = {
      providerSubject: identity.providerSubject,
      userId,
      displayName: identity.displayName ?? identity.email ?? identity.providerSubject,
      memberships: [{ userId, workspaceId, role }],
      ...(identity.email === undefined ? {} : { email: identity.email }),
    };
    this.recordsByProviderSubject.set(identity.providerSubject, record);
    return toPrincipal(record);
  }
}

function toPrincipal(record: IdentityRecord): IdentityPrincipal {
  return {
    actor: {
      userId: record.userId,
      memberships: record.memberships,
    },
    displayName: record.displayName,
    ...(record.email === undefined ? {} : { email: record.email }),
  };
}

function stableIdentityPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length === 0 ? "provider_user" : normalized.slice(0, 64);
}

export interface IdentityPersistence {
  repository: IdentityRepository;
  close(): Promise<void>;
}

export function createIdentityPersistenceFromConfig(config: DokezaConfig): IdentityPersistence {
  if (config.database.realtimePersistence === "memory") {
    return {
      repository: new InMemoryIdentityRepository(),
      close: async () => undefined,
    };
  }

  if (config.database.url === undefined) {
    throw new Error("DATABASE_URL is required for PostgreSQL identity persistence.");
  }

  if (config.auth.hostedProvider.issuer === undefined) {
    throw new Error("DOKEZA_HOSTED_AUTH_ISSUER is required for PostgreSQL identity persistence.");
  }

  const pool = createPool(config.database.url, { max: config.database.poolMax });
  const db = createDatabase(pool);

  return {
    repository: new PgIdentityRepository({
      db,
      providerIssuer: config.auth.hostedProvider.issuer,
    }),
    close: async () => {
      await closePool(pool);
    },
  };
}
