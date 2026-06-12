-- Dokeza workspace isolation baseline.
-- All tables in this migration are synthetic-safe scaffolding for the first
-- executable architecture slice; production migrations will extend these
-- shapes rather than bypass workspace isolation.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table workspaces (
  id text primary key,
  name text not null,
  plan text not null default 'individual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id text primary key,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_memberships (
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table workspace_policies (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  retention_mode text not null default '30_days',
  cloud_stt_allowed boolean not null default true,
  cloud_llm_allowed boolean not null default true,
  screen_context_allowed boolean not null default false,
  direct_provider_stt_allowed boolean not null default false,
  prompt_content_logging_allowed boolean not null default false,
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (direct_provider_stt_allowed = false)
);

create table meeting_sessions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  created_by text not null references users(id),
  meeting_source text not null,
  status text not null check (status in ('created', 'active', 'paused', 'ended', 'failed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transcript_segments (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  meeting_session_id text not null references meeting_sessions(id) on delete cascade,
  speaker text not null check (speaker in ('user', 'remote', 'unknown')),
  text text not null,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms >= start_ms),
  confidence numeric(4,3) check (confidence >= 0 and confidence <= 1),
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transcript_gaps (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  meeting_session_id text not null references meeting_sessions(id) on delete cascade,
  stream text not null check (stream in ('microphone', 'system')),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms >= start_ms),
  dropped_chunks integer not null check (dropped_chunks > 0),
  reason text not null,
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table suggestions (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  meeting_session_id text not null references meeting_sessions(id) on delete cascade,
  kind text not null,
  content text not null,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  prompt_version text not null,
  model text not null,
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  owner_user_id text references users(id),
  title text not null,
  source text not null,
  status text not null check (status in ('active', 'disabled', 'deleted')),
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table document_chunks (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  document_id text not null references documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  text text not null,
  embedding vector(1536),
  permission_tags text[] not null default array[]::text[],
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table integration_connections (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  provider text not null,
  scopes text[] not null default array[]::text[],
  status text not null check (status in ('active', 'revoked', 'expired')),
  secret_ref text not null,
  created_by text references users(id),
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  actor_user_id text references users(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  created_at timestamptz not null default now()
);

alter table workspace_policies enable row level security;
alter table meeting_sessions enable row level security;
alter table transcript_segments enable row level security;
alter table transcript_gaps enable row level security;
alter table suggestions enable row level security;
alter table documents enable row level security;
alter table document_chunks enable row level security;
alter table integration_connections enable row level security;
alter table audit_logs enable row level security;

create policy workspace_policies_workspace_isolation on workspace_policies
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));

create policy meeting_sessions_workspace_isolation on meeting_sessions
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));

create policy transcript_segments_workspace_isolation on transcript_segments
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));

create policy transcript_gaps_workspace_isolation on transcript_gaps
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));

create policy suggestions_workspace_isolation on suggestions
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));

create policy documents_workspace_isolation on documents
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));

create policy document_chunks_workspace_isolation on document_chunks
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));

create policy integration_connections_workspace_isolation on integration_connections
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));

create policy audit_logs_workspace_isolation on audit_logs
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));
