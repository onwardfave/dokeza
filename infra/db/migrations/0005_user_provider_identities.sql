create table user_provider_identities (
  provider_issuer text not null,
  provider_subject text not null,
  user_id text not null references users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_issuer, provider_subject),
  unique (user_id, provider_issuer)
);

create index if not exists user_provider_identities_user_idx
  on user_provider_identities (user_id);
