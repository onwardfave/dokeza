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

export interface WorkspaceMembershipRecord {
  userId: string;
  role: WorkspaceRole;
  email?: string;
  displayName?: string;
}

export interface WorkspaceMembershipUpsert {
  workspaceId: string;
  userId: string;
  email: string;
  role: WorkspaceRole;
  displayName?: string;
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
  listWorkspaceMemberships(workspaceId: string): Promise<WorkspaceMembershipRecord[]>;
  upsertWorkspaceMembership(input: WorkspaceMembershipUpsert): Promise<WorkspaceMembershipRecord>;
  deleteWorkspaceMembership(workspaceId: string, userId: string): Promise<boolean>;
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

  async listWorkspaceMemberships(workspaceId: string): Promise<WorkspaceMembershipRecord[]> {
    const rows = await this.db
      .select({
        userId: workspaceMemberships.userId,
        role: workspaceMemberships.role,
        email: users.email,
        displayName: users.displayName,
      })
      .from(workspaceMemberships)
      .innerJoin(users, eq(users.id, workspaceMemberships.userId))
      .where(eq(workspaceMemberships.workspaceId, workspaceId));

    return rows.map((row) => ({
      userId: row.userId,
      role: row.role as WorkspaceRole,
      email: row.email,
      ...(row.displayName === null ? {} : { displayName: row.displayName }),
    }));
  }

  async upsertWorkspaceMembership(
    input: WorkspaceMembershipUpsert,
  ): Promise<WorkspaceMembershipRecord> {
    await this.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      await db
        .insert(users)
        .values({
          id: input.userId,
          email: input.email,
          displayName: input.displayName ?? input.email,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: input.email,
            displayName: input.displayName ?? input.email,
            updatedAt: new Date(),
          },
        });
      await db
        .insert(workspaceMemberships)
        .values({
          workspaceId: input.workspaceId,
          userId: input.userId,
          role: input.role,
        })
        .onConflictDoUpdate({
          target: [workspaceMemberships.workspaceId, workspaceMemberships.userId],
          set: {
            role: input.role,
            updatedAt: new Date(),
          },
        });
    });

    return {
      userId: input.userId,
      email: input.email,
      displayName: input.displayName ?? input.email,
      role: input.role,
    };
  }

  async deleteWorkspaceMembership(workspaceId: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.userId, userId),
        ),
      )
      .returning({ userId: workspaceMemberships.userId });

    return deleted.length > 0;
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

  async listWorkspaceMemberships(workspaceId: string): Promise<WorkspaceMembershipRecord[]> {
    const memberships: WorkspaceMembershipRecord[] = [];
    for (const record of this.recordsByProviderSubject.values()) {
      for (const membership of record.memberships) {
        if (membership.workspaceId === workspaceId) {
          memberships.push({
            userId: membership.userId,
            role: membership.role,
            ...(record.email === undefined ? {} : { email: record.email }),
            displayName: record.displayName,
          });
        }
      }
    }

    return memberships;
  }

  async upsertWorkspaceMembership(
    input: WorkspaceMembershipUpsert,
  ): Promise<WorkspaceMembershipRecord> {
    let record = [...this.recordsByProviderSubject.values()].find(
      (candidate) => candidate.userId === input.userId,
    );
    if (record === undefined) {
      record = {
        providerSubject: `manual_${input.userId}`,
        userId: input.userId,
        email: input.email,
        displayName: input.displayName ?? input.email,
        memberships: [],
      };
      this.recordsByProviderSubject.set(record.providerSubject, record);
    }

    record.email = input.email;
    record.displayName = input.displayName ?? input.email;
    record.memberships = record.memberships.filter(
      (membership) => membership.workspaceId !== input.workspaceId,
    );
    record.memberships.push({
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
    });

    return {
      userId: input.userId,
      email: input.email,
      displayName: input.displayName ?? input.email,
      role: input.role,
    };
  }

  async deleteWorkspaceMembership(workspaceId: string, userId: string): Promise<boolean> {
    let deleted = false;
    for (const record of this.recordsByProviderSubject.values()) {
      const before = record.memberships.length;
      record.memberships = record.memberships.filter(
        (membership) => membership.workspaceId !== workspaceId || membership.userId !== userId,
      );
      deleted ||= record.memberships.length !== before;
    }

    return deleted;
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

  const pool = createPool(config.database.url, {
    max: config.database.poolMax,
    ...(config.database.role === undefined ? {} : { role: config.database.role }),
  });
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
