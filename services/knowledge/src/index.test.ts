import { describe, expect, it } from "vitest";
import {
  InMemoryKnowledgeRepository,
  KnowledgeRepositoryError,
  chunkDocumentText,
  createRetrievalRequest,
} from "./index.js";

describe("knowledge service boundary", () => {
  const actor = {
    userId: "user_1",
    memberships: [{ userId: "user_1", workspaceId: "ws_a", role: "member" as const }],
  };

  it("creates workspace-scoped retrieval requests", () => {
    expect(createRetrievalRequest(actor, "ws_a", "pricing", 3, ["doc_1"])).toEqual({
      workspaceId: "ws_a",
      actorUserId: "user_1",
      query: "pricing",
      topK: 3,
      allowedDocumentIds: ["doc_1"],
    });
  });

  it("blocks cross-workspace retrieval", () => {
    expect(() => createRetrievalRequest(actor, "ws_b", "pricing")).toThrow(
      "workspace_access_denied:no_membership",
    );
  });

  it("chunks document text deterministically without empty chunks", () => {
    expect(
      chunkDocumentText("Intro\n\nPricing terms apply.\n\nSecurity controls apply.", 24),
    ).toEqual(["Intro", "Pricing terms apply.", "Security controls apply."]);
  });

  it("uploads, lists, details, and searches workspace-scoped documents", async () => {
    const repository = new InMemoryKnowledgeRepository({
      now: () => new Date("2026-07-04T00:00:00.000Z"),
      idGenerator: createSequenceIds("a", "b", "c"),
    });

    const uploaded = await repository.uploadDocument({
      workspaceId: "ws_1",
      actorUserId: "user_1",
      title: "Security FAQ",
      source: "manual_upload",
      text: "Provider credentials stay server-side.\n\nPricing is reviewed each quarter.",
      permissionTags: [" sales ", "sales", ""],
    });

    expect(uploaded.document).toMatchObject({
      document_id: "doc_a",
      workspace_id: "ws_1",
      title: "Security FAQ",
      chunk_count: 1,
      created_by: "user_1",
    });
    expect(uploaded.chunks).toEqual([
      {
        chunk_id: "chunk_b",
        document_id: "doc_a",
        chunk_index: 0,
        text: "Provider credentials stay server-side.\n\nPricing is reviewed each quarter.",
        permission_tags: ["sales"],
      },
    ]);

    await expect(repository.listDocuments("ws_1")).resolves.toEqual({
      workspace_id: "ws_1",
      documents: [uploaded.document],
    });
    expect(JSON.stringify(await repository.listDocuments("ws_1"))).not.toContain(
      "Provider credentials",
    );

    await expect(repository.getDocumentDetail("ws_1", "doc_a")).resolves.toEqual(uploaded);
    await expect(repository.getDocumentDetail("ws_2", "doc_a")).resolves.toBeUndefined();

    await expect(
      repository.search({ workspaceId: "ws_1", query: "credentials", topK: 3 }),
    ).resolves.toMatchObject({
      workspace_id: "ws_1",
      query: "credentials",
      results: [
        {
          document_id: "doc_a",
          title: "Security FAQ",
          source: "manual_upload",
          chunk_id: "chunk_b",
          text: expect.stringContaining("credentials"),
          score: 1,
        },
      ],
    });
    await expect(repository.search({ workspaceId: "ws_2", query: "credentials" })).resolves.toEqual(
      {
        workspace_id: "ws_2",
        query: "credentials",
        results: [],
      },
    );
  });

  it("restricts search to allowed document IDs when provided", async () => {
    const repository = new InMemoryKnowledgeRepository({
      seeds: [
        {
          document: {
            document_id: "doc_allowed",
            workspace_id: "ws_1",
            title: "Allowed",
            source: "manual_upload",
            status: "active",
            chunk_count: 1,
          },
          chunks: [
            {
              chunk_id: "chunk_allowed",
              document_id: "doc_allowed",
              chunk_index: 0,
              text: "Pricing handbook",
              permission_tags: [],
            },
          ],
        },
        {
          document: {
            document_id: "doc_restricted",
            workspace_id: "ws_1",
            title: "Restricted",
            source: "manual_upload",
            status: "active",
            chunk_count: 1,
          },
          chunks: [
            {
              chunk_id: "chunk_restricted",
              document_id: "doc_restricted",
              chunk_index: 0,
              text: "Pricing executive notes",
              permission_tags: ["executive"],
            },
          ],
        },
      ],
    });

    await expect(
      repository.search({
        workspaceId: "ws_1",
        query: "pricing",
        allowedDocumentIds: ["doc_allowed"],
      }),
    ).resolves.toMatchObject({
      results: [{ document_id: "doc_allowed" }],
    });
  });

  it("blocks cloud document persistence when retention mode is live-only or local-only", async () => {
    const repository = new InMemoryKnowledgeRepository({ retentionMode: "live_only" });

    await expect(
      repository.uploadDocument({
        workspaceId: "ws_1",
        actorUserId: "user_1",
        title: "Blocked",
        source: "manual_upload",
        text: "Do not persist this document.",
      }),
    ).rejects.toMatchObject(new KnowledgeRepositoryError("knowledge_storage_blocked"));
  });

  it("rejects blank upload content and blank search queries without echoing content", async () => {
    const repository = new InMemoryKnowledgeRepository();

    await expect(
      repository.uploadDocument({
        workspaceId: "ws_1",
        actorUserId: "user_1",
        title: "Blank",
        source: "manual_upload",
        text: "   ",
      }),
    ).rejects.toMatchObject(new KnowledgeRepositoryError("invalid_request"));
    await expect(repository.search({ workspaceId: "ws_1", query: " " })).rejects.toMatchObject(
      new KnowledgeRepositoryError("invalid_request"),
    );
  });
});

function createSequenceIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `extra_${index}`;
}
