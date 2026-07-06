import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, createDatabase, createPool, users, workspaceMemberships } from "@dokeza/db";
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
});

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

describePostgres("PostgreSQL identity repository integration", () => {
  const pool = createPool(databaseUrl, { max: 2 });
  const db = createDatabase(pool);
  const repository = new PgIdentityRepository({ db, providerIssuer });

  beforeAll(async () => {
    await pool`
      insert into users (id, email, display_name)
      values (${userId}, ${`${userId}@example.com`}, 'Existing Identity User')
      on conflict (id) do nothing
    `;
    await pool`
      insert into workspaces (id, name, plan)
      values (${workspaceId}, 'Existing Identity Workspace', 'individual')
      on conflict (id) do nothing
    `;
    await pool`
      insert into workspace_memberships (workspace_id, user_id, role)
      values (${workspaceId}, ${userId}, 'admin')
      on conflict (workspace_id, user_id) do nothing
    `;
    await pool`
      insert into user_provider_identities (
        provider_issuer, provider_subject, user_id, email, display_name
      )
      values (${providerIssuer}, ${providerSubject}, ${userId}, ${`${userId}@example.com`}, 'Existing Identity User')
      on conflict (provider_issuer, provider_subject) do nothing
    `;
  });

  afterAll(async () => {
    await pool`delete from workspaces where id = ${workspaceId}`;
    await pool`delete from users where id like ${`user_${suffix}%`} or id = ${userId}`;
    await pool`delete from users where email like ${`%${suffix}%`}`;
    await closePool(pool);
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
});
