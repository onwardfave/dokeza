-- Enforce tenant isolation for normal service connections.
-- Migrations run as a privileged owner; services connect with
-- DOKEZA_DATABASE_ROLE=dokeza_app and cannot bypass row-level security.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dokeza_app') then
    create role dokeza_app nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end
$$;

grant usage on schema public to dokeza_app;

grant select, insert, update, delete on table
  workspaces,
  users,
  workspace_memberships,
  user_provider_identities,
  workspace_policies,
  meeting_sessions,
  transcript_segments,
  transcript_gaps,
  suggestions,
  documents,
  document_chunks,
  integration_connections,
  audit_logs
to dokeza_app;

alter table workspace_policies force row level security;
alter table meeting_sessions force row level security;
alter table transcript_segments force row level security;
alter table transcript_gaps force row level security;
alter table suggestions force row level security;
alter table documents force row level security;
alter table document_chunks force row level security;
alter table integration_connections force row level security;
alter table audit_logs force row level security;

-- A workspace has exactly zero or one policy row. Multiple matches made policy
-- resolution fail closed, but preventing the invalid state is safer.
create unique index workspace_policies_workspace_unique_idx
  on workspace_policies (workspace_id);

alter default privileges in schema public
  grant select, insert, update, delete on tables to dokeza_app;
alter default privileges in schema public
  grant usage, select on sequences to dokeza_app;

-- Local/CI migration owners need to be able to SET ROLE for adversarial tests.
-- Managed environments may grant this membership through infrastructure too.
do $$
begin
  execute format('grant dokeza_app to %I', current_user);
end
$$;
