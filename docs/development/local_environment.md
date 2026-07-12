# Local Development Environment

## Required Tools

Windows development requires:

- Node.js `22.22.3`
- pnpm `10.22.0`
- Git
- Docker Desktop
- GitHub CLI
- Rust/Cargo `1.96.0`
- Visual Studio Build Tools with the C++ workload
- Terraform `1.15.6`
- Gitleaks
- Trivy

Install or repair the Windows baseline with:

```powershell
pwsh -NoLogo -NoProfile -File scripts/setup-windows-dev.ps1
```

Then open a new terminal and verify the active shell:

```powershell
pnpm toolchain:verify
```

## Standard Checks

Run the default pre-merge checks:

```powershell
pnpm check
pnpm --filter @dokeza/desktop build
```

## PostgreSQL Integration Tests

Start the local PostgreSQL/pgvector stack:

```powershell
pnpm dev:infra
```

Run the opt-in PostgreSQL integration suites:

```powershell
$env:DOKEZA_PG_INTEGRATION = "1"
$env:DATABASE_URL = "postgres://dokeza:dokeza_local@localhost:5432/dokeza"
pnpm --filter @dokeza/realtime test -- postgres-persistence.integration.test.ts
pnpm --filter @dokeza/api test -- meeting-review-postgres.integration.test.ts
```

The integration fixtures use `DATABASE_URL` only for migrations and synthetic setup, then instantiate the repositories as `dokeza_app`. For a locally running PostgreSQL-backed service also set:

```powershell
$env:DOKEZA_DATABASE_ROLE = "dokeza_app"
```

Preview, staging, and production default to `dokeza_app`; setting the variable explicitly is recommended in deployment manifests. Never give a running service the migration owner's unrestricted connection. CI runs the same restricted-role integration suites against a fresh `pgvector/pgvector:pg17` service after applying `infra/db/migrations/*.sql`.

## API Perimeter

Local/test API defaults allow the Vite/Tauri development origins and enforce a 1 MiB JSON body limit plus 120 requests per 60 seconds per hashed credential/IP key. Override for local testing with:

```powershell
$env:DOKEZA_API_ALLOWED_ORIGINS = "http://127.0.0.1:1420,http://tauri.localhost,tauri://localhost"
$env:DOKEZA_API_MAX_JSON_BODY_BYTES = "1048576"
$env:DOKEZA_API_RATE_LIMIT_WINDOW_MS = "60000"
$env:DOKEZA_API_RATE_LIMIT_MAX_REQUESTS = "120"
```

Staging and production refuse to start without an explicit allowed-origin list. `/health` reports basic service/config health; `/ready` additionally probes the configured PostgreSQL connection under `DOKEZA_DATABASE_ROLE` when PostgreSQL persistence is active.

## Local Development Auth

Local and test environments enable a development-only auth issuer so the API, realtime service, and desktop can exercise workspace-scoped tokens before a hosted identity provider is selected.

Default local auth settings:

- Issuer: `https://auth.local.dokeza.dev`
- Audience: `dokeza`
- Signing secret: `dev_only_dokeza_auth_secret_do_not_use`
- API token TTL: 3600 seconds
- Realtime token TTL: 300 seconds

Production-like environments require `DOKEZA_AUTH_SIGNING_SECRET` and reject `DOKEZA_DEV_AUTH_ENABLED=true`.

Hosted provider auth can be enabled for staging or production-alpha API testing with:

```powershell
$env:DOKEZA_HOSTED_AUTH_ENABLED = "true"
$env:DOKEZA_HOSTED_AUTH_ISSUER = "https://<auth0-tenant-domain>/"
$env:DOKEZA_HOSTED_AUTH_AUDIENCE = "dokeza-api"
$env:DOKEZA_HOSTED_AUTH_JWKS_URL = "https://<auth0-tenant-domain>/.well-known/jwks.json"
```

For production-alpha Auth0 setup:

1. Create an Auth0 Native Application for the desktop client.
2. Configure the Auth0 API audience to match `DOKEZA_HOSTED_AUTH_AUDIENCE`.
3. Configure an exact Allowed Callback URL for the desktop loopback redirect, for example `http://127.0.0.1:57619/auth/callback`.
4. Do not configure or ship a desktop client secret.
5. Keep `DOKEZA_DEV_AUTH_ENABLED=false` for hosted-auth smoke tests and production-like environments.

The current desktop hosted-auth flow exposes Auth0 domain, client ID, audience, redirect URI, and callback URL fields in the live-session panel. Under Tauri, starting hosted auth opens the browser, waits for the local loopback callback, exchanges the provider token with the API, and stores the resulting Dokeza API session plus provider refresh metadata through secure token storage. When the stored Dokeza API session is expired or near expiry, the desktop can refresh through Auth0 and rotate the stored refresh token if Auth0 returns one. Browser preview can still use the callback field as a manual smoke-test fallback because it cannot bind a native loopback listener.

For the desktop hosted-auth product path, set these Vite variables before starting the desktop dev server when the defaults are not suitable:

```powershell
$env:VITE_DOKEZA_API_ENDPOINT = "http://127.0.0.1:3000"
$env:VITE_DOKEZA_REALTIME_ENDPOINT = "ws://127.0.0.1:3001/realtime"
$env:VITE_DOKEZA_AUTH0_DOMAIN = "https://<auth0-tenant-domain>"
$env:VITE_DOKEZA_AUTH0_CLIENT_ID = "<auth0-native-app-client-id>"
$env:VITE_DOKEZA_AUTH0_AUDIENCE = "dokeza-api"
$env:VITE_DOKEZA_AUTH0_REDIRECT_URI = "http://127.0.0.1:57619/auth/callback"
```

Development-token controls remain available only inside the live-session panel's developer configuration disclosure for local/test fallback.

When hosted auth is enabled, the API accepts provider tokens only at:

```text
POST /v1/auth/provider/exchange
```

The exchange verifies the provider token and returns a Dokeza API token plus Dokeza-owned workspace memberships. Realtime and resource APIs continue to require Dokeza-issued API or realtime tokens. Development auth is not a production fallback.

Request a synthetic local API token:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3000/v1/dev/auth/token `
  -Body '{"user_id":"user_dev","workspace_id":"ws_dev","role":"admin"}'
```

Exchange the API token for a short-lived realtime token:

```powershell
$apiToken = "<token from /v1/dev/auth/token>"
Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:3000/v1/realtime/token `
  -Headers @{ Authorization = "Bearer $apiToken" } `
  -Body '{"workspace_id":"ws_dev","device_id":"dev_desktop_preview"}'
```

The desktop preview panel can perform the same exchange with the `Get dev token` button when pointed at the local API endpoint.

Run native desktop checks:

```powershell
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm --filter @dokeza/desktop tauri build --debug --no-bundle
```

Run infrastructure and security checks:

```powershell
terraform -chdir=infra/terraform init -backend=false
terraform -chdir=infra/terraform validate
pnpm security:audit
pnpm security:secrets
pnpm security:vulns
```

## Cloud AI Providers (optional, for real-provider testing)

Local and CI default to deterministic, credential-free STT/LLM/embedding
providers. To exercise the live pipeline against real providers, set
server-side credentials in the shell that launches the services. Credentials
must never enter the repo, CI, images, or telemetry.

Live suggestions can route through either the OpenAI Responses API or any
OpenAI-compatible chat-completions endpoint:

```powershell
# OpenAI Responses API (default production path)
$env:DOKEZA_LLM_PROVIDER = "openai"
$env:OPENAI_API_KEY = "<sk-...>"
$env:OPENAI_MODEL = "gpt-4.1-mini"

# OpenAI-compatible chat completions — e.g. NVIDIA NIM (free tier), Groq,
# Together, OpenRouter, or a local vLLM/Ollama. Select provider via base URL,
# model via OPENAI_MODEL.
$env:DOKEZA_LLM_PROVIDER = "openai_chat"
$env:OPENAI_BASE_URL = "https://integrate.api.nvidia.com/v1"
$env:OPENAI_MODEL = "meta/llama-3.1-8b-instruct"
$env:OPENAI_API_KEY = "<nvapi-...>"   # NVIDIA key from build.nvidia.com
```

Embeddings and STT are configured independently (`DOKEZA_EMBEDDING_PROVIDER`,
`DEEPGRAM_API_KEY`); leave them deterministic to test only the LLM path.

The provider-boundary smoke harness exercises whichever providers are
configured:

```powershell
pnpm --filter @dokeza/realtime build
pnpm --filter @dokeza/realtime exec tsx scripts/alpha5a-provider-smoke.ts
```

## Telemetry Defaults

Local telemetry and observability are for synthetic development data by default. Do not enable prompt, transcript, document, suggestion, or raw audio logging unless a workspace policy and privacy review explicitly allow it.

Start the local observability stack:

```powershell
pnpm observability:up
```

Local endpoints:

- OTLP gRPC: `localhost:4317`
- OTLP HTTP: `http://localhost:4318`
- Prometheus: `http://localhost:9090`
- Jaeger: `http://localhost:16686`
- Grafana: `http://localhost:3001`

Stop the stack:

```powershell
pnpm observability:down
```
