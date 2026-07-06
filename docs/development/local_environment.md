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

CI runs the same integration suites against a fresh `pgvector/pgvector:pg17` service after applying `infra/db/migrations/*.sql`.

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

The current desktop hosted-auth foundation exposes Auth0 domain, client ID, audience, redirect URI, and callback URL fields in the live-session panel. Until the native loopback listener lands, complete local smoke tests by starting hosted auth, finishing the browser flow, pasting the full loopback callback URL into the callback field, and completing hosted auth. The desktop then exchanges the provider token with the API and stores only the resulting Dokeza API session through secure token storage when running under Tauri.

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
