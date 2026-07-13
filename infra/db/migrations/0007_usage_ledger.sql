-- Metadata-only provider usage attribution for production cost controls.
-- This table intentionally has no transcript, prompt, source, or suggestion content columns.

create table usage_events (
  id text primary key default gen_random_uuid()::text,
  workspace_id text not null references workspaces(id) on delete cascade,
  meeting_session_id text not null references meeting_sessions(id) on delete cascade,
  request_id text not null,
  feature text not null check (feature in ('live_suggestion')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  status text not null check (status in ('completed', 'provider_error', 'budget_rejected')),
  token_estimation_method text not null check (token_estimation_method in ('utf8_bytes_upper_bound')),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  transcript_tokens integer not null check (transcript_tokens >= 0),
  source_tokens integer not null check (source_tokens >= 0),
  user_prompt_tokens integer not null check (user_prompt_tokens >= 0),
  system_tokens integer not null check (system_tokens >= 0),
  source_count integer not null check (source_count >= 0),
  estimated_cost_microusd integer check (estimated_cost_microusd >= 0),
  cost_estimate_status text not null check (cost_estimate_status in ('priced', 'unpriced')),
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_events_scope_unique
    unique (workspace_id, meeting_session_id, request_id, feature)
);

create index usage_events_workspace_session_created_idx
  on usage_events (workspace_id, meeting_session_id, created_at desc);

alter table usage_events enable row level security;
alter table usage_events force row level security;

create policy usage_events_workspace_isolation on usage_events
  using (workspace_id = current_setting('app.current_workspace_id', true))
  with check (workspace_id = current_setting('app.current_workspace_id', true));

grant select, insert, update, delete on table usage_events to dokeza_app;
