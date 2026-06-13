import { authorizeWorkspace, type Actor } from "@dokeza/authz";

export interface RetrievalRequest {
  workspaceId: string;
  actorUserId: string;
  query: string;
  topK: number;
  allowedDocumentIds?: readonly string[];
}

export function createRetrievalRequest(
  actor: Actor,
  workspaceId: string,
  query: string,
  topK = 5,
  allowedDocumentIds?: readonly string[],
): RetrievalRequest {
  const authorization = authorizeWorkspace(actor, workspaceId);
  if (!authorization.allowed) {
    throw new Error(`workspace_access_denied:${authorization.reason}`);
  }

  if (query.trim().length === 0) {
    throw new Error("retrieval_query_required");
  }

  return {
    workspaceId,
    actorUserId: actor.userId,
    query,
    topK,
    ...(allowedDocumentIds === undefined ? {} : { allowedDocumentIds }),
  };
}
