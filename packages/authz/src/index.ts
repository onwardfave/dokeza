export type WorkspaceRole = "owner" | "admin" | "member";

export interface WorkspaceMembership {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

export interface Actor {
  userId: string;
  memberships: readonly WorkspaceMembership[];
}

export interface WorkspaceAuthorization {
  allowed: boolean;
  reason?: "no_membership" | "role_not_allowed";
  role?: WorkspaceRole;
}

const roleRank: Record<WorkspaceRole, number> = {
  member: 1,
  admin: 2,
  owner: 3
};

export function authorizeWorkspace(
  actor: Actor,
  workspaceId: string,
  minimumRole: WorkspaceRole = "member"
): WorkspaceAuthorization {
  const membership = actor.memberships.find((candidate) =>
    candidate.userId === actor.userId && candidate.workspaceId === workspaceId
  );

  if (membership === undefined) {
    return { allowed: false, reason: "no_membership" };
  }

  if (roleRank[membership.role] < roleRank[minimumRole]) {
    return {
      allowed: false,
      reason: "role_not_allowed",
      role: membership.role
    };
  }

  return {
    allowed: true,
    role: membership.role
  };
}

export function requireWorkspace(
  actor: Actor,
  workspaceId: string,
  minimumRole: WorkspaceRole = "member"
): WorkspaceRole {
  const result = authorizeWorkspace(actor, workspaceId, minimumRole);
  if (!result.allowed) {
    throw new Error(`workspace_access_denied:${result.reason}`);
  }
  if (result.role === undefined) {
    throw new Error("workspace_access_denied:no_role");
  }
  return result.role;
}
