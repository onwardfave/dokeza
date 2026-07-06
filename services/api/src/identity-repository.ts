import type { ProviderIdentity } from "@dokeza/auth";
import type { Actor, WorkspaceMembership, WorkspaceRole } from "@dokeza/authz";

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
