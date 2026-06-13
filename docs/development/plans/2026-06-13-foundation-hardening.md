# Foundation Hardening Implementation Plan

## Goal

Prepare Dokeza for feature implementation by making the local and CI environments reproducible, adding quality and security gates, and establishing a local observability baseline that preserves the documented default redaction policy.

## Requirements and Milestone

- Milestone 0: Product and Architecture Foundation.
- Milestone 1: Core Desktop and Realtime Backbone.
- Requirements: NFR-020 to NFR-024, NFR-040 to NFR-046, NFR-100 to NFR-104.

## Affected Architecture

- Root developer tooling and workspace scripts.
- GitHub Actions CI/CD gates.
- Tauri desktop native build toolchain.
- Terraform validation baseline.
- Local observability stack under `infra/observability`.
- Shared config and telemetry package boundaries.

## Contracts and Data Model

- No realtime, REST, AI output, or database contract changes.
- Telemetry configuration is additive and must not introduce content logging.
- Terraform baseline remains provider-neutral until the cloud provider decision is made.

## Security and Privacy

- Telemetry must exclude raw transcript, prompt, document, suggestion, and audio content by default.
- Secret scanning must run in CI and be available locally.
- Dependency and filesystem vulnerability scans must run in CI.
- Local observability must be for synthetic development data unless a workspace policy explicitly allows debug telemetry.

## Implementation Tasks

1. Install and verify local system tools: Rust/Cargo, Rustfmt, Clippy, Terraform, Gitleaks, Trivy, Docker, and GitHub CLI.
2. Add pinned Node and Rust toolchain metadata.
3. Add repo scripts for formatting, linting, security checks, and toolchain verification.
4. Add ESLint and Prettier configuration without formatting generated artifacts.
5. Add GitHub Actions CI for Node checks, desktop native smoke checks, Terraform validation, secret scanning, and vulnerability scanning.
6. Add Terraform placeholder root so `terraform validate` has a stable target.
7. Add local OpenTelemetry Collector, Prometheus, Jaeger, and Grafana configuration.
8. Extend config/telemetry packages with safe OTEL configuration helpers and tests.
9. Update DevOps documentation with the concrete local/CI baseline.

## Tests and Verification

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @dokeza/desktop build`
- `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check`
- `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- `terraform -chdir=infra/terraform init -backend=false`
- `terraform -chdir=infra/terraform validate`
- `gitleaks detect --source . --redact`
- `trivy fs --scanners vuln,secret,misconfig .`

## Documentation Updates

- This implementation plan.
- Local development environment instructions.
- DevOps CI/CD and observability details.

## Rollback or Degraded Behavior

- Tooling changes are additive.
- CI jobs can be adjusted independently if external scanner availability causes false positives.
- Local observability stack can be stopped without affecting application development.

## Open Questions

- Production cloud provider and observability vendor remain undecided.
- Full desktop installer signing is still future release work.
