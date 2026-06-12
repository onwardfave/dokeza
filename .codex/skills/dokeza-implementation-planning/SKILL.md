---
name: dokeza-implementation-planning
description: Create implementation plans for Dokeza features before coding. Use for multi-step implementation work, architecture-affecting changes, new services, new desktop capabilities, new integrations, AI pipeline changes, security-sensitive changes, or any task that touches multiple files, contracts, tests, or docs.
---

# Dokeza Implementation Planning

## Workflow

Announce: "I'm using the Dokeza implementation-planning skill."

1. Read the relevant docs:
   - `AGENTS.md`
   - `docs/srs/traceability_matrix.md`
   - `docs/architecture/code_architecture.md`
   - Any affected architecture, security, DevOps, or testing doc.
2. Identify the requirement IDs, milestone, and product vertical.
3. Identify affected contracts:
   - Realtime protocol.
   - REST API.
   - Data model.
   - AI structured output.
   - Telemetry event.
4. Identify affected trust boundaries and workspace isolation rules.
5. Write a plan with small, verifiable tasks.
6. Specify tests before implementation.
7. Specify docs that must be updated.

## Plan Format

Save substantial plans under:

```text
docs/development/plans/YYYY-MM-DD-<feature-name>.md
```

Use this structure:

```markdown
# <Feature> Implementation Plan

## Goal
## Requirements and Milestone
## Affected Architecture
## Contracts and Data Model
## Security and Privacy
## Implementation Tasks
## Tests and Verification
## Documentation Updates
## Rollback or Degraded Behavior
## Open Questions
```

## Gates

Do not start coding if:

- The feature has no testable acceptance criteria.
- Workspace isolation is ambiguous.
- A new external data flow is not documented.
- Realtime message changes are not reflected in the protocol doc.
- Failure behavior is unknown.

