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
