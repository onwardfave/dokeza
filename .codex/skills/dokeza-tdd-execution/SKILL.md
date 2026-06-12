---
name: dokeza-tdd-execution
description: Implement Dokeza features using TDD, incremental verification, and review gates. Use when coding planned features, fixing behavior, changing contracts, adding services, implementing desktop functionality, or modifying AI/retrieval/security-sensitive paths.
---

# Dokeza TDD Execution

## Workflow

Announce: "I'm using the Dokeza TDD-execution skill."

1. Read the implementation plan if one exists.
2. Identify the smallest behavior slice.
3. Write or update a failing test first where practical.
4. Implement the smallest code change to pass.
5. Run targeted verification.
6. Repeat until the slice is complete.
7. Run broader checks for the touched area.
8. Review against the checklist below.
9. Update docs when contracts, architecture, security, testing, or operations change.

## Test Selection

Use the narrowest meaningful test first:

- Pure logic: unit test.
- Module with dependencies: component test with fakes.
- Protocol/API change: contract test.
- Database or provider adapter: integration test.
- Full workflow: e2e test.
- AI behavior: evaluation case.
- Failure behavior: failure-mode or property test.

## Review Checklist

Before finishing:

- Requirement or milestone is identified.
- Tests prove the behavior.
- Workspace authorization is enforced.
- Sensitive content is not logged by default.
- External data flows are documented.
- Realtime contract changes are versioned.
- Prompt or model changes have eval coverage.
- Failure behavior matches `docs/architecture/failure_modes.md`.
- Telemetry exists for production verification.

## Stop Conditions

Stop and update the plan when:

- The implementation needs a new service boundary.
- A contract must break compatibility.
- A new trust boundary appears.
- A test cannot be written because behavior is unclear.
- The chosen technology contradicts an ADR.

