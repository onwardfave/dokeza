import { describe, expect, it } from "vitest";
import {
  validateKnowledgeDocumentDetailResponse,
  validateKnowledgeDocumentListResponse,
  validateKnowledgeDocumentUploadRequest,
  validateKnowledgeDocumentUploadResponse,
  validateKnowledgeSearchResponse,
} from "./knowledge.js";

describe("knowledge contracts", () => {
  it("accepts document upload requests with source metadata", () => {
    expect(
      validateKnowledgeDocumentUploadRequest({
        title: "Security FAQ",
        source: "manual_upload",
        text: "Dokeza keeps provider credentials server-side.",
        permission_tags: ["sales"],
      }),
    ).toBe(true);
    expect(validateKnowledgeDocumentUploadRequest({ title: "Missing text" })).toBe(false);
  });

  it("accepts list responses without document content", () => {
    const response = {
      workspace_id: "ws_1",
      documents: [
        {
          document_id: "doc_1",
          workspace_id: "ws_1",
          title: "Security FAQ",
          source: "manual_upload",
          status: "active",
          chunk_count: 2,
          created_by: "user_1",
          created_at: "2026-07-04T00:00:00.000Z",
          updated_at: "2026-07-04T00:00:00.000Z",
        },
      ],
    };

    expect(validateKnowledgeDocumentListResponse(response)).toBe(true);
    expect(JSON.stringify(response)).not.toContain("provider credentials");
  });

  it("accepts detail, upload, and search responses with chunk source metadata", () => {
    const detail = {
      document: {
        document_id: "doc_1",
        workspace_id: "ws_1",
        title: "Security FAQ",
        source: "manual_upload",
        status: "active",
        chunk_count: 1,
      },
      chunks: [
        {
          chunk_id: "chunk_1",
          document_id: "doc_1",
          chunk_index: 0,
          text: "Provider credentials stay server-side.",
          permission_tags: ["sales"],
        },
      ],
    };

    expect(validateKnowledgeDocumentDetailResponse(detail)).toBe(true);
    expect(validateKnowledgeDocumentUploadResponse(detail)).toBe(true);
    expect(
      validateKnowledgeSearchResponse({
        workspace_id: "ws_1",
        query: "credentials",
        results: [
          {
            document_id: "doc_1",
            title: "Security FAQ",
            source: "manual_upload",
            chunk_id: "chunk_1",
            chunk_index: 0,
            text: "Provider credentials stay server-side.",
            score: 1,
          },
        ],
      }),
    ).toBe(true);
  });
});
