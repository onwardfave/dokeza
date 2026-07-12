import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogs,
  closePool,
  createDatabase,
  createPool,
  users,
  withWorkspaceTransaction,
  workspaceMemberships,
} from "@dokeza/db";
import { eq } from "drizzle-orm";
import { InMemoryIdentityRepository, PgIdentityRepository } from "./identity-repository.js";

describe("identity repositories", () => {
  it("resolves existing in-memory provider identities without exposing provider tokens", async () => {
    const repository = new InMemoryIdentityRepository([
      {
        providerSubject: "provider_user_1",
        userId: "user_provider_1",
        email: "provider@example.com",
        displayName: "Provider User",
        memberships: [{ userId: "user_provider_1", workspaceId: "ws_provider", role: "admin" }],
      },
    ]);

    await expect(
      repository.resolveProviderIdentity({
        providerSubject: "provider_user_1",
        email: "provider@example.com",
        displayName: "Provider User",
      }),
    ).resolves.toEqual({
      actor: {
        userId: "user_provider_1",
        memberships: [{ userId: "user_provider_1", workspaceId: "ws_provider", role: "admin" }],
      },
      displayName: "Provider User",
      email: "provider@example.com",
    });
  });

  it("requires an owner for owner-role mutations", async () => {
    const repository = createMembershipPolicyRepository();

    await expect(
      repository.upsertWorkspaceMembership({
        workspaceId: "ws_policy",
        actorUserId: "user_admin",
        userId: "user_member",
        email: "member@example.com",
        role: "owner",
      }),
    ).rejects.toMatchObject({ code: "membership_owner_required" });

    await expect(
      repository.deleteWorkspaceMembership({
        workspaceId: "ws_policy",
        actorUserId: "user_admin",
        userId: "user_owner",
      }),
    ).rejects.toMatchObject({ code: "membership_owner_required" });
  });

  it("prevents deleting or demoting the final workspace owner", async () => {
    const repository = createMembershipPolicyRepository();

    await expect(
      repository.deleteWorkspaceMembership({
        workspaceId: "ws_policy",
        actorUserId: "user_owner",
        userId: "user_owner",
      }),
    ).rejects.toMatchObject({ code: "last_workspace_owner" });

    await expect(
      repository.upsertWorkspaceMembership({
        workspaceId: "ws_policy",
        actorUserId: "user_owner",
        userId: "user_owner",
        email: "owner@example.com",
        role: "admin",
      }),
    ).rejects.toMatchObject({ code: "last_workspace_owner" });
  });

  it("allows an owner to transfer ownership before stepping down", async () => {
    const repository = createMembershipPolicyRepository();

    await repository.upsertWorkspaceMembership({
      workspaceId: "ws_policy",
      actorUserId: "user_owner",
      userId: "user_admin",
      email: "admin@example.com",
      role: "owner",
    });
    await repository.upsertWorkspaceMembership({
      workspaceId: "ws_policy",
      actorUserId: "user_owner",
      userId: "user_owner",
      email: "owner@example.com",
      role: "admin",
    });

    await expect(repository.listWorkspaceMemberships("ws_policy")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "user_owner", role: "admin" }),
        expect.objectContaining({ userId: "user_admin", role: "owner" }),
      ]),
    );
  });
});

function createMembershipPolicyRepository(): InMemoryIdentityRepository {
  return new InMemoryIdentityRepository([
    {
      providerSubject: "provider_owner",
      userId: "user_owner",
      email: "owner@example.com",
      displayName: "Owner",
      memberships: [{ userId: "user_owner", workspaceId: "ws_policy", role: "owner" }],
    },
    {
      providerSubject: "provider_admin",
      userId: "user_admin",
      email: "admin@example.com",
      displayName: "Admin",
      memberships: [{ userId: "user_admin", workspaceId: "ws_policy", role: "admin" }],
    },
    {
      providerSubject: "provider_member",
      userId: "user_member",
      email: "member@example.com",
      displayName: "Member",
      memberships: [{ userId: "user_member", workspaceId: "ws_policy", role: "member" }],
    },
  ]);
}

// Run with:
// $env:DOKEZA_PG_INTEGRATION='1'; $env:DATABASE_URL='postgres://dokeza:dokeza_local@localhost:5432/dokeza'; pnpm --filter @dokeza/api test -- identity-repository.test.ts
const runPostgresIntegration = process.env.DOKEZA_PG_INTEGRATION === "1";
const describePostgres = runPostgresIntegration ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://dokeza:dokeza_local@localhost:5432/dokeza";

const suffix = `identity_itest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const providerIssuer = "https://idp.example.com/";
const providerSubject = `provider_${suffix}`;
const userId = `user_${suffix}`;
const workspaceId = `ws_${suffix}`;
const policyWorkspaceId = `ws_${suffix}_policy`;
const policyOwnerId = `user_${suffix}_owner`;
const policyAdminId = `user_${suffix}_admin`;

describePostgres("PostgreSQL identity repository integration", () => {
  const adminPool = createPool(databaseUrl, { max: 2 });
  const appPool = createPool(databaseUrl, { max: 2, role: "dokeza_app" });
  const db = createDatabase(appPool);
  const repository = new PgIdentityRepository({ db, providerIssuer });

  beforeAll(async () => {
    await adminPool`
      insert into users (id, email, display_name)
      values (${userId}, ${`${userId}@example.com`}, 'Existing Identity User'),
             (${policyOwnerId}, ${`${policyOwnerId}@example.com`}, 'Policy Owner'),
             (${policyAdminId}, ${`${policyAdminId}@example.com`}, 'Policy Admin')
      on conflict (id) do nothing
    `;
    await adminPool`
      insert into workspaces (id, name, plan)
      values (${workspaceId}, 'Existing Identity Workspace', 'individual'),
             (${policyWorkspaceId}, 'Policy Workspace', 'team')
      on conflict (id) do nothing
    `;
    await adminPool`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspaceId}, ${userId}, 'admin'),
             (${policyWorkspaceId}, ${policyOwnerId}, 'owner'),
             (${policyWorkspaceId}, ${policyAdminId}, 'admin')
      on conflict (workspace_id, user_id) do nothing
    `;
    await adminPool`
      insert into user_provider_identities (
        provider_issuer, provider_subject, user_id, email, display_name
      )
      values (${providerIssuer}, ${providerSubject}, ${userId}, ${`${userId}@example.com`}, 'Existing Identity User')
      on conflict (provider_issuer, provider_subject) do nothing
    `;
  });

  afterAll(async () => {
    await adminPool`delete from workspaces where id in (${workspaceId}, ${policyWorkspaceId})`;
    await adminPool`delete from users where id like ${`user_${suffix}%`} or id = ${userId}`;
    await adminPool`delete from users where email like ${`%${suffix}%`}`;
    await closePool(appPool);
    await closePool(adminPool);
  });

  it("loads Dokeza-owned memberships for an existing provider identity", async () => {
    await expect(
      repository.resolveProviderIdentity({
        providerSubject,
        email: `${userId}@example.com`,
        displayName: "Updated Identity User",
      }),
    ).resolves.toEqual({
      actor: {
        userId,
        memberships: [{ userId, workspaceId, role: "admin" }],
      },
      displayName: "Updated Identity User",
      email: `${userId}@example.com`,
    });
  });

  it("provisions a first workspace for a new provider identity", async () => {
    const newSubject = `${providerSubject}_new`;
    const principal = await repository.resolveProviderIdentity({
      providerSubject: newSubject,
      email: `${newSubject}@example.com`,
      displayName: "New Identity User",
    });

    expect(principal.actor.userId).toBe(`user_${newSubject}`);
    expect(principal.actor.memberships).toEqual([
      { userId: `user_${newSubject}`, workspaceId: `ws_${newSubject}`, role: "owner" },
    ]);

    const rows = await db
      .select()
      .from(workspaceMemberships)
      .where(eq(workspaceMemberships.userId, `user_${newSubject}`));
    expect(rows).toHaveLength(1);

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, `user_${newSubject}`));
    expect(userRows[0]?.displayName).toBe("New Identity User");
  });

  it("enforces owner invariants transactionally in PostgreSQL", async () => {
    await expect(
      repository.upsertWorkspaceMembership({
        workspaceId: policyWorkspaceId,
        actorUserId: policyAdminId,
        userId: policyAdminId,
        email: `${policyAdminId}@example.com`,
        role: "owner",
      }),
    ).rejects.toMatchObject({ code: "membership_owner_required" });

    await expect(
      repository.deleteWorkspaceMembership({
        workspaceId: policyWorkspaceId,
        actorUserId: policyOwnerId,
        userId: policyOwnerId,
      }),
    ).rejects.toMatchObject({ code: "last_workspace_owner" });

    const memberId = `user_${suffix}_member`;
    await repository.upsertWorkspaceMembership({
      workspaceId: policyWorkspaceId,
      actorUserId: policyOwnerId,
      userId: memberId,
      email: `${memberId}@example.com`,
      role: "member",
    });
    await repository.deleteWorkspaceMembership({
      workspaceId: policyWorkspaceId,
      actorUserId: policyOwnerId,
      userId: memberId,
    });

    const auditRows = await withWorkspaceTransaction(db, policyWorkspaceId, (tx) =>
      tx.select({ action: auditLogs.action, actorUserId: auditLogs.actorUserId }).from(auditLogs),
    );
    expect(auditRows).toEqual(
      expect.arrayContaining([
        {
          action: "workspace.membership.upserted",
          actorUserId: policyOwnerId,
        },
        {
          action: "workspace.membership.deleted",
          actorUserId: policyOwnerId,
        },
      ]),
    );
  });

  it("serializes competing owner removals so one owner always remains", async () => {
    await repository.upsertWorkspaceMembership({
      workspaceId: policyWorkspaceId,
      actorUserId: policyOwnerId,
      userId: policyAdminId,
      email: `${policyAdminId}@example.com`,
      role: "owner",
    });

    const outcomes = await Promise.allSettled([
      repository.deleteWorkspaceMembership({
        workspaceId: policyWorkspaceId,
        actorUserId: policyOwnerId,
        userId: policyAdminId,
      }),
      repository.deleteWorkspaceMembership({
        workspaceId: policyWorkspaceId,
        actorUserId: policyAdminId,
        userId: policyOwnerId,
      }),
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter(({ status }) => status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: {
        code: expect.stringMatching(/^(membership_actor_not_authorized|last_workspace_owner)$/),
      },
    });
    const memberships = await repository.listWorkspaceMemberships(policyWorkspaceId);
    expect(memberships.filter(({ role }) => role === "owner")).toHaveLength(1);
  });
});
