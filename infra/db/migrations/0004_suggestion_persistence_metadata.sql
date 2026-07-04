alter table suggestions
  add column if not exists request_id text,
  add column if not exists sources_json text not null default '[]',
  add column if not exists server_seq integer;

create index if not exists suggestions_workspace_meeting_seq_idx
  on suggestions (workspace_id, meeting_session_id, server_seq, created_at);
