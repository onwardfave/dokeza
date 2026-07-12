# Alpha.5a Manual Run Runbook

Turnkey prep for the **human-only** legs of Alpha.5a that the automated harness
cannot cover: Auth0 browser sign-in and a real-microphone desktop session. The
provider layer (Deepgram STT, live suggestion, embeddings) is already proven
against real services — see [`2026-07-10-alpha5a-smoke.md`](2026-07-10-alpha5a-smoke.md).

Follow the phase list in
[`../../testing/alpha5a-smoke-test-checklist.md`](../../testing/alpha5a-smoke-test-checklist.md)
and record results in a dated copy of
[`TEMPLATE-alpha5a-smoke.md`](TEMPLATE-alpha5a-smoke.md). Keep everything
content-free.

## Prerequisites

1. **Auth0** (one-time), per [`local_environment.md`](../local_environment.md):
   - A **Native Application** (desktop client) and an **API** whose identifier is
     `dokeza-api`.
   - Allowed Callback URL exactly `http://127.0.0.1:57619/auth/callback`.
   - No client secret.
2. **Provider keys** at User scope (already set this session): `NVIDIA_API_KEY`,
   `DEEPGRAM_API_KEY`. NVIDIA is used for the LLM so the run costs nothing.
3. **Docker Desktop** running (for PostgreSQL).

## Provider / persistence choice (read this)

| Concern            | Recommendation for the manual run                                             |
| ------------------ | ----------------------------------------------------------------------------- |
| LLM (suggestions)  | NVIDIA `openai_chat` — free, proven within the 3s target.                      |
| STT                | Deepgram (real key).                                                           |
| Persistence        | `postgres` — required for meeting review / export / delete.                    |
| Knowledge embeddings | See below. **No free 1536-dim option exists.**                              |

The pgvector column is fixed at **1536 dims**, and no available NVIDIA embedding
model is 1536 (e5-v5 = 1024, nv-embed-v1 = 4096, llama-nemotron = 2048). So on
the Postgres path you have three choices for the knowledge/source-cited step:

- **Deterministic embeddings** (`DOKEZA_EMBEDDING_PROVIDER=deterministic`) —
  keyword-grade retrieval, zero cost. Fine to exercise the upload → cite flow;
  semantic quality is not representative.
- **OpenAI `text-embedding-3-small`** (1536) — real semantic retrieval, needs a
  **funded** OpenAI key (the test key is quota-exhausted).
- **NVIDIA + in-memory** persistence — real 1024-dim embeddings, but loses
  durable review/export/delete. Not recommended for this run.

Recommended default: **Postgres + NVIDIA LLM + deterministic embeddings**, and
note in the QA record that semantic retrieval was not exercised. Switch to a
funded OpenAI key only if source-grounded quality must be validated now.

## Environment (PowerShell, one terminal for the services)

```powershell
# secrets from User scope (never echoed)
$env:OPENAI_API_KEY   = [Environment]::GetEnvironmentVariable("NVIDIA_API_KEY","User")
$env:DEEPGRAM_API_KEY = [Environment]::GetEnvironmentVariable("DEEPGRAM_API_KEY","User")

# LLM via NVIDIA (free, OpenAI-compatible chat)
$env:DOKEZA_LLM_PROVIDER = "openai_chat"
$env:OPENAI_BASE_URL     = "https://integrate.api.nvidia.com/v1"
$env:OPENAI_MODEL        = "meta/llama-3.1-8b-instruct"

# Embeddings: deterministic keeps the run free and Postgres-compatible
$env:DOKEZA_EMBEDDING_PROVIDER = "deterministic"

# Hosted auth ON, dev auth OFF
$env:DOKEZA_DEV_AUTH_ENABLED    = "false"
$env:DOKEZA_HOSTED_AUTH_ENABLED = "true"
$env:DOKEZA_HOSTED_AUTH_ISSUER   = "https://<tenant>.us.auth0.com/"
$env:DOKEZA_HOSTED_AUTH_AUDIENCE = "dokeza-api"
$env:DOKEZA_HOSTED_AUTH_JWKS_URL = "https://<tenant>.us.auth0.com/.well-known/jwks.json"

# Persistence + base config
$env:DOKEZA_REALTIME_PERSISTENCE = "postgres"
$env:DATABASE_URL = "postgres://dokeza:dokeza_local@localhost:5432/dokeza"
$env:DOKEZA_ENV="local"; $env:PORT="3000"; $env:LOG_LEVEL="info"
$env:DOKEZA_TELEMETRY_ENABLED="true"; $env:DOKEZA_TELEMETRY_CONTENT_LOGGING_ALLOWED="false"
$env:OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"; $env:OTEL_TRACES_SAMPLER_ARG="1"
$env:DOKEZA_AUTH_ISSUER="https://auth.local.dokeza.dev"; $env:DOKEZA_AUTH_AUDIENCE="dokeza"
$env:DOKEZA_AUTH_SIGNING_SECRET="dev_only_dokeza_auth_secret_do_not_use"
```

## Start sequence

```powershell
pnpm dev:infra          # PostgreSQL + pgvector
pnpm db:migrate         # apply schema
pnpm dev                # API :3000 + realtime :3001 (keep this terminal open)
```

In a **second** terminal, set the desktop Vite vars, then launch the app:

```powershell
$env:VITE_DOKEZA_API_ENDPOINT      = "http://127.0.0.1:3000"
$env:VITE_DOKEZA_REALTIME_ENDPOINT = "ws://127.0.0.1:3001/realtime"
$env:VITE_DOKEZA_AUTH0_DOMAIN      = "https://<tenant>.us.auth0.com"
$env:VITE_DOKEZA_AUTH0_CLIENT_ID   = "<native-app-client-id>"
$env:VITE_DOKEZA_AUTH0_AUDIENCE    = "dokeza-api"
$env:VITE_DOKEZA_AUTH0_REDIRECT_URI = "http://127.0.0.1:57619/auth/callback"
pnpm --filter @dokeza/desktop tauri dev
```

## Run + record

1. Work through [`../../testing/alpha5a-smoke-test-checklist.md`](../../testing/alpha5a-smoke-test-checklist.md)
   — sign in via Auth0, start a real mic session, request a suggestion, review,
   export, delete, and exercise ≥2 degraded paths.
2. Copy [`TEMPLATE-alpha5a-smoke.md`](TEMPLATE-alpha5a-smoke.md) to
   `docs/development/qa/<date>-alpha5a-manual.md` and fill it as you go.
3. Keep it content-free; file a follow-up for every deviation.
