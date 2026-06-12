# Dokeza CI/CD and Release Strategy

## 1. Purpose

This document defines the software delivery process for Dokeza across desktop, web, backend, infrastructure, and AI artifacts.

## 2. Branching Model

Use short-lived feature branches with pull requests.

Required branch classes:

- `main`: always releasable.
- `release/*`: optional release stabilization branches.
- `feature/*`: implementation work.
- `hotfix/*`: urgent production fixes.

## 3. Required CI Checks

Every pull request must pass:

- Formatting.
- Linting.
- Type checking.
- Unit tests.
- Contract tests.
- Security scan.
- Secret scan.
- Dependency audit.
- Changed-docs check for architecture, contract, security, or requirement changes.

Service-specific checks:

- Desktop: Tauri build smoke test, native unit tests, frontend tests.
- Backend: container build, database migration validation, service integration tests.
- AI: prompt regression tests, schema validation, eval smoke tests.
- Infrastructure: Terraform format, validate, plan.

## 4. Deployment Flow

```text
pull request
  -> CI checks
  -> review
  -> merge to main
  -> build immutable artifacts
  -> deploy to staging
  -> smoke and contract tests
  -> production approval
  -> progressive rollout
  -> monitor
```

## 5. Artifact Rules

- Every build artifact must be traceable to source revision.
- Backend containers must be immutable.
- Desktop installers must be signed.
- Update manifests must be signed.
- Prompt bundles must be versioned.
- Database migrations must be forward-compatible with currently deployed services.

## 6. Release Gates

A release cannot proceed if:

- Contract tests fail.
- Authz tests fail.
- Secret scan fails.
- Database migration rollback plan is missing.
- Desktop crash rate from beta exceeds threshold.
- P95 live suggestion latency regresses beyond threshold.
- Prompt evaluation shows unacceptable hallucination or source-grounding regression.

## 7. Rollback

Rollback plans must exist for:

- Backend services.
- Database migrations.
- Desktop auto-update.
- Prompt bundle versions.
- Integration adapters.
- Infrastructure changes.

Backend rollback should prefer redeploying the previous immutable artifact. Desktop rollback should use update channel controls and previous signed versions.

## 8. Environment Promotion

No artifact should be rebuilt between staging and production. Promotion moves the same artifact through environments.

Configuration differences must come from environment-specific secrets and config, not source changes.

