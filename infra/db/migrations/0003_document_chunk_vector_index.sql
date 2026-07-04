create index if not exists document_chunks_embedding_hnsw_idx
  on document_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists document_chunks_workspace_document_idx
  on document_chunks (workspace_id, document_id);
