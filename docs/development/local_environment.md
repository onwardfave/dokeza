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

## Local Development Auth

Local and test environments enable a development-only auth issuer so the API, realtime service, and desktop can exercise workspace-scoped tokens before a hosted identity provider is selected.

Default local auth settings:

- Issuer: `https://auth.local.dokeza.dev`
- Audience: `dokeza`
- Signing secret: `dev_only_dokeza_auth_secret_do_not_use`
- API token TTL: 3600 seconds
- Realtime token TTL: 300 seconds

Production-like environments require `DOKEZA_AUTH_SIGNING_SECRET` and reject `DOKEZA_DEV_AUTH_ENABLED=true`.

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
