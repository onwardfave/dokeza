import { describe, expect, it } from "vitest";
import type { TelemetryEvent } from "@dokeza/telemetry";
import {
  DeterministicKnowledgeEmbeddingProvider,
  InMemoryKnowledgeRepository,
  KnowledgeEmbeddingError,
  OpenAiKnowledgeEmbeddingProvider,
  KnowledgeRepositoryError,
  chunkDocumentText,
  createRetrievalRequest,
  type KnowledgeEmbeddingInput,
  type KnowledgeEmbeddingProvider,
  type KnowledgeEmbeddingResult,
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

  it("uses embeddings for vector matches when keyword search misses", async () => {
    const embeddingProvider = new AxisEmbeddingProvider((input) => {
      if (input.text.toLowerCase().includes("expansion")) {
        return vectorOnAxis(0);
      }
      if (input.text.toLowerCase().includes("renewal")) {
        return vectorOnAxis(0);
      }
      return vectorOnAxis(1);
    });
    const repository = new InMemoryKnowledgeRepository({
      embeddingProvider,
      now: () => new Date("2026-07-04T00:00:00.000Z"),
      idGenerator: createSequenceIds("doc", "chunk"),
    });

    const uploaded = await repository.uploadDocument({
      workspaceId: "ws_1",
      actorUserId: "user_1",
      title: "Expansion Playbook",
      source: "manual_upload",
      text: "Expansion playbook for account planning.",
    });

    await expect(
      repository.search({ workspaceId: "ws_1", query: "renewal", topK: 1 }),
    ).resolves.toMatchObject({
      results: [
        {
          document_id: uploaded.document.document_id,
          chunk_id: uploaded.chunks[0]?.chunk_id,
          score: 1,
        },
      ],
    });
  });

  it("blocks no-storage uploads before embedding provider submission", async () => {
    const embeddingProvider = new AxisEmbeddingProvider(() => vectorOnAxis(0));
    const repository = new InMemoryKnowledgeRepository({
      retentionMode: "local_only",
      embeddingProvider,
    });

    await expect(
      repository.uploadDocument({
        workspaceId: "ws_1",
        actorUserId: "user_1",
        title: "Blocked",
        source: "manual_upload",
        text: "Do not embed this document.",
      }),
    ).rejects.toMatchObject(new KnowledgeRepositoryError("knowledge_storage_blocked"));
    expect(embeddingProvider.calls).toHaveLength(0);
  });

  it("falls back to keyword retrieval when embedding generation fails", async () => {
    const repository = new InMemoryKnowledgeRepository({
      embeddingProvider: new FailingEmbeddingProvider(),
      now: () => new Date("2026-07-04T00:00:00.000Z"),
      idGenerator: createSequenceIds("doc", "chunk"),
    });

    await repository.uploadDocument({
      workspaceId: "ws_1",
      actorUserId: "user_1",
      title: "Pricing FAQ",
      source: "manual_upload",
      text: "Pricing terms renew quarterly.",
    });

    await expect(repository.search({ workspaceId: "ws_1", query: "pricing" })).resolves.toEqual({
      workspace_id: "ws_1",
      query: "pricing",
      results: [
        {
          document_id: "doc_doc",
          title: "Pricing FAQ",
          source: "manual_upload",
          chunk_id: "chunk_chunk",
          chunk_index: 0,
          text: "Pricing terms renew quarterly.",
          score: 1,
        },
      ],
    });
  });

  it("emits a metadata-only telemetry signal when embedding generation fails", async () => {
    const events: TelemetryEvent[] = [];
    const repository = new InMemoryKnowledgeRepository({
      embeddingProvider: new FailingEmbeddingProvider(),
      telemetrySink: (event) => events.push(event),
      now: () => new Date("2026-07-04T00:00:00.000Z"),
      idGenerator: createSequenceIds("doc", "chunk"),
    });

    await repository.uploadDocument({
      workspaceId: "ws_1",
      actorUserId: "user_1",
      title: "Pricing FAQ",
      source: "manual_upload",
      text: "Pricing terms renew quarterly.",
    });
    await repository.search({ workspaceId: "ws_1", query: "pricing" });

    const uploadEvent = events.find(
      (event) =>
        event.name === "knowledge.embedding_provider_failed" &&
        event.fields.route === "document_chunk",
    );
    const searchEvent = events.find(
      (event) =>
        event.name === "knowledge.embedding_provider_failed" &&
        event.fields.route === "search_query",
    );

    expect(uploadEvent?.fields).toMatchObject({
      workspaceId: "ws_1",
      route: "document_chunk",
      provider: "deterministic",
      model: "failing-test",
      errorCategory: "embedding_provider_unavailable",
      degradedTo: "keyword_only",
    });
    expect(searchEvent?.fields.route).toBe("search_query");

    // Content-free: no query/chunk/document text leaks into telemetry fields.
    const leakedKeys = events
      .flatMap((event) => Object.keys(event.fields))
      .filter((key) => /text|query|content|prompt|title/i.test(key));
    expect(leakedKeys).toEqual([]);
  });

  it("creates deterministic credential-free embeddings", async () => {
    const provider = new DeterministicKnowledgeEmbeddingProvider(1536);
    const first = await provider.embed({
      workspaceId: "ws_1",
      route: "search_query",
      text: "pricing security",
    });
    const second = await provider.embed({
      workspaceId: "ws_1",
      route: "search_query",
      text: "pricing security",
    });

    expect(first.vector).toHaveLength(1536);
    expect(first.vector).toEqual(second.vector);
    expect(first.provider).toBe("deterministic");
  });

  it("maps OpenAI embedding responses through a fake transport", async () => {
    const captured: { url?: string; body?: unknown; authorization?: string } = {};
    const provider = new OpenAiKnowledgeEmbeddingProvider({
      apiKey: "sk-test-secret",
      baseUrl: "https://api.openai.com/v1",
      model: "embedding-test",
      timeoutMs: 1000,
      dimensions: 1536,
      transport: async (url, init) => {
        captured.url = url;
        captured.body = JSON.parse(init.body) as unknown;
        captured.authorization = init.headers.authorization ?? "";
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ embedding: vectorOnAxis(0) }] }),
        };
      },
    });

    await expect(
      provider.embed({
        workspaceId: "ws_1",
        route: "document_chunk",
        documentId: "doc_1",
        chunkId: "chunk_1",
        text: "Sensitive customer content",
      }),
    ).resolves.toMatchObject({
      provider: "openai",
      model: "embedding-test",
      dimensions: 1536,
      vector: vectorOnAxis(0),
    });
    expect(captured.url).toBe("https://api.openai.com/v1/embeddings");
    expect(captured.authorization).toBe("Bearer sk-test-secret");
    expect(captured.body).toEqual({
      model: "embedding-test",
      input: "Sensitive customer content",
      dimensions: 1536,
    });
  });

  it("sanitizes OpenAI embedding provider failures", async () => {
    const provider = new OpenAiKnowledgeEmbeddingProvider({
      apiKey: "sk-test-secret",
      baseUrl: "https://api.openai.com/v1",
      model: "embedding-test",
      timeoutMs: 1000,
      dimensions: 1536,
      transport: async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "provider details" } }),
      }),
    });

    await expect(
      provider.embed({
        workspaceId: "ws_1",
        route: "document_chunk",
        text: "Sensitive customer content",
      }),
    ).rejects.toMatchObject(new KnowledgeEmbeddingError("embedding_provider_unavailable"));
    await expect(
      provider.embed({
        workspaceId: "ws_1",
        route: "document_chunk",
        text: "Sensitive customer content",
      }),
    ).rejects.not.toThrow(/Sensitive customer content|sk-test-secret/);
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

class AxisEmbeddingProvider implements KnowledgeEmbeddingProvider {
  readonly provider = "deterministic" as const;
  readonly model = "axis-test";
  readonly dimensions = 1536;
  readonly calls: KnowledgeEmbeddingInput[] = [];
  private readonly vectorFor: (input: KnowledgeEmbeddingInput) => number[];

  constructor(vectorFor: (input: KnowledgeEmbeddingInput) => number[]) {
    this.vectorFor = vectorFor;
  }

  async embed(input: KnowledgeEmbeddingInput): Promise<KnowledgeEmbeddingResult> {
    this.calls.push(input);
    return {
      vector: this.vectorFor(input),
      provider: this.provider,
      model: this.model,
      dimensions: this.dimensions,
    };
  }
}

class FailingEmbeddingProvider implements KnowledgeEmbeddingProvider {
  readonly provider = "deterministic" as const;
  readonly model = "failing-test";
  readonly dimensions = 1536;

  async embed(): Promise<KnowledgeEmbeddingResult> {
    throw new KnowledgeEmbeddingError("embedding_provider_unavailable");
  }
}

function vectorOnAxis(axis: number): number[] {
  return Array.from({ length: 1536 }, (_, index) => (index === axis ? 1 : 0));
}
