# Dokeza Agent Development Workflow

## 1. Purpose

This document is the living operating playbook for building Dokeza with an AI coding agent. It defines the repeatable flow from selecting the next feature slice through planning, context loading, implementation, testing, debugging, verification, documentation, and commits.

The goal is to keep agent work efficient, auditable, and aligned with Dokeza's roadmap, security model, and production-readiness bar. Update this document when repeated work reveals a better process or a recurring failure mode.

Sources reviewed:

- Antithesis "skills for agents" blog: `https://antithesis.com/blog/2026/agent_skills/`
- Antithesis skills repository: `https://github.com/antithesishq/antithesis-skills`
- Superpowers repository: `https://github.com/obra/superpowers`

## 2. Operating Principles

Agents should optimize for steady, verified progress over large unreviewable changes.

- Start from the roadmap, not from convenient code.
- Load only the context needed for the slice, but load all required security and architecture context for that slice.
- Keep each slice independently verifiable.
- Prefer contracts, repository interfaces, and adapters that make later production wiring possible without client churn.
- Use tests as the executable definition of behavior whenever practical.
- Keep transcript, prompt, document, suggestion, token, and raw audio content out of logs, diagnostics, and telemetry by default.
- Commit meaningful checkpoints as work progresses.
- Update documentation in the same slice that changes behavior, contracts, data flows, or user workflows.

## 3. Canonical Loop

Use this loop for every non-trivial feature.

1. Identify the slice.
   - Start from `docs/development/plans/2026-06-25-production-vertical-roadmap.md`.
   - Name the milestone, requirement IDs, user-visible behavior, and acceptance criteria.
   - Prefer the smallest vertical step that makes the product more complete.

2. Inspect repo state.
   - Run `git status --short`.
   - Review recent commits when continuing after user changes.
   - Do not overwrite unrelated user changes.

3. Load context.
   - Read `AGENTS.md`.
   - Read the roadmap and the slice-specific plan if it exists.
   - Read the relevant SRS, architecture, security, DevOps, and testing docs.
   - Read relevant project-local skills under `.codex/skills/`.

4. Select skills.
   - Use `dokeza-implementation-planning` for multi-file, architecture-affecting, contract, security, or user-workflow changes.
   - Use `dokeza-tdd-execution` for implementation.
   - Use `dokeza-systematic-debugging` for any failing test, typecheck, build, or unexpected behavior.
   - Use `dokeza-verification-before-completion` before claiming completion.
   - Use domain skills such as `dokeza-data-governance`, `dokeza-provider-integration`, `dokeza-reliability-testing`, or `dokeza-desktop-realtime-client` when the slice touches those areas.

5. Plan.
   - For substantial work, create or update a plan under `docs/development/plans/YYYY-MM-DD-<feature-name>.md`.
   - Include goal, requirements, affected architecture, contracts/data model, security/privacy, implementation tasks, tests, docs, rollback/degraded behavior, and open questions.
   - Commit the plan before implementation when it is substantial.

6. Implement in checkpoints.
   - Write or update tests first where practical.
   - Implement the smallest behavior that satisfies the tests.
   - Run targeted verification.
   - Commit a coherent checkpoint.
   - Repeat.

7. Debug systematically.
   - Read the full error.
   - Reproduce with the exact failing command.
   - Identify root cause before editing.
   - Fix at the source, not only at the symptom.
   - Add or update a regression test if the failure represents product behavior.

8. Update docs.
   - Update roadmap status after a slice lands.
   - Update architecture, protocol, failure-mode, data-flow, testing, or DevOps docs when their governed behavior changes.
   - Update this workflow when a repeated lesson should become standard practice.

9. Verify.
   - Run targeted checks during development.
   - Run the final verification gate before completion.
   - Read outputs and report evidence, not guesses.

10. Handoff.
    - Ensure `git status --short` is clean unless explicitly handing off known work in progress.
    - Summarize commits, verification, remaining risks, and next slice.

## 4. Context Matrix

Use this matrix to decide which docs and skills to load.

| Slice type | Required docs | Required skills |
| --- | --- | --- |
| Any substantial feature | `AGENTS.md`, roadmap, `docs/srs/traceability_matrix.md`, `docs/architecture/code_architecture.md`, `docs/testing/testing_strategy.md` | `dokeza-implementation-planning`, `dokeza-tdd-execution`, `dokeza-verification-before-completion` |
| Desktop realtime or capture | `docs/architecture/realtime_protocol.md`, `docs/architecture/failure_modes.md`, desktop plans, `docs/security/data_flows.md` | `dokeza-desktop-realtime-client`, `dokeza-tdd-execution`, `dokeza-systematic-debugging` as needed |
| Realtime protocol or WebSocket server | `docs/architecture/realtime_protocol.md`, `docs/architecture/failure_modes.md`, `docs/testing/testing_strategy.md` | `dokeza-tdd-execution`, `dokeza-reliability-testing` when stateful recovery is involved |
| REST API or contracts | `docs/architecture/code_architecture.md`, `docs/architecture/authentication.md`, `docs/architecture/multi_tenancy.md`, `docs/testing/testing_strategy.md` | `dokeza-implementation-planning`, `dokeza-tdd-execution` |
| Database, retention, deletion, export, transcript persistence | `docs/security/data_flows.md`, `docs/security/threat_model.md`, `docs/architecture/multi_tenancy.md`, `docs/architecture/failure_modes.md` | `dokeza-data-governance`, `dokeza-tdd-execution` |
| External providers | `docs/security/data_flows.md`, `docs/security/threat_model.md`, provider ADRs, affected architecture docs | `dokeza-provider-integration`, `dokeza-data-governance` when customer content crosses provider boundary |
| Reliability, reconnect, queues, distributed state | `docs/architecture/failure_modes.md`, `docs/testing/testing_strategy.md`, relevant property catalogs | `dokeza-reliability-testing`, `dokeza-systematic-debugging` |
| AI prompts, retrieval, suggestions | `docs/security/threat_model.md`, `docs/testing/testing_strategy.md`, AI/retrieval architecture docs | `dokeza-data-governance`, `dokeza-provider-integration` when model providers are used |
| Infrastructure, CI, release | `docs/devops/infrastructure_architecture.md`, `docs/devops/ci_cd_release.md`, `docs/security/threat_model.md` | `dokeza-implementation-planning`, provider/security skills as needed |

If the user asks for a review rather than implementation, use a code-review stance: findings first, ordered by severity, with file and line references.

## 5. Planning Gate

Do not start coding substantial work until these are known:

- Milestone and requirement IDs.
- User-visible acceptance criteria.
- Affected contracts.
- Affected data model or persistence path.
- Workspace isolation boundary.
- Retention, deletion, export, or no-storage implications.
- External provider or new data-flow implications.
- Failure/degraded behavior.
- Tests that will prove the behavior.

Stop and update the plan if:

- A public contract must change unexpectedly.
- A new trust boundary appears.
- Workspace isolation is ambiguous.
- A new provider path is needed without data-flow documentation.
- Failure behavior is unclear.
- The implementation contradicts an ADR or roadmap decision.

## 6. Implementation Checkpoints

Prefer checkpoint commits in this order when applicable:

1. Plan or roadmap clarification.
2. Contracts and generated schema artifacts.
3. Domain/repository/service logic.
4. API or realtime server wiring.
5. Desktop/client wiring.
6. Docs and roadmap status.
7. Formatting-only cleanup when needed.

Keep checkpoints coherent. Do not mix unrelated refactors into a feature commit.

## 7. Testing Strategy During Work

Use the narrowest useful tests first:

- Pure logic: unit tests.
- Repository or service boundary: component tests with fakes.
- Public contract: contract tests plus generated schema drift check.
- Database/RLS: integration tests where local PostgreSQL is available, plus in-memory component tests where DB wiring is not yet owned by the service.
- Desktop UI logic: protocol/client/view-model tests first; UI wiring should still pass typecheck and build.
- Stateful behavior: reliability/property tests or a property catalog when the behavior is concurrent or failure-prone.

Run targeted verification after each meaningful checkpoint. Examples:

```text
pnpm --filter @dokeza/contracts test
pnpm --filter @dokeza/api test
pnpm --filter @dokeza/desktop typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## 8. Debugging Gate

When a command fails:

1. Read the entire failure output.
2. Re-run or preserve the exact failing command.
3. Inspect recent diffs and the component boundary.
4. State the root cause internally before patching.
5. Patch the smallest source-level cause.
6. Re-run the original failing command.
7. Run broader checks if the fix touched shared behavior.

Common recurring Dokeza failures:

- `exactOptionalPropertyTypes` rejects explicit `undefined`; omit optional fields instead.
- Contract changes require generated JSON Schema artifacts.
- Realtime protocol changes require `docs/architecture/realtime_protocol.md`.
- New failure behavior requires `docs/architecture/failure_modes.md`.
- New external data flow requires `docs/security/data_flows.md`.
- Native desktop changes require Rust verification, not just TypeScript checks.

## 9. Verification Gate

Before claiming completion:

1. Run `pnpm check`.
2. If contracts changed, run `pnpm generate:schemas` and verify no unexpected git drift.
3. If Rust/native desktop changed, run:

```text
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

4. If a desktop app behavior changed substantially, run the desktop build or explain why it was not run:

```text
pnpm --filter @dokeza/desktop build
```

5. Run `git status --short`.
6. Report exact evidence: commands, pass/fail, test counts where visible, and any skipped tests or unverified risks.

## 10. Documentation Gate

Update documentation in the same slice when:

- A service boundary changes.
- A public REST API or realtime message changes.
- Generated schemas change.
- A database, retention, deletion, export, or no-storage behavior changes.
- A workspace policy or trust boundary changes.
- A new provider or external system is added.
- A new failure behavior or degraded mode is introduced.
- A user-visible workflow changes.
- A repeated lesson should become a standard workflow rule.

Roadmap status updates should be concrete:

- `Done` only when the behavior is implemented and verified.
- `Partially implemented` when contracts/UI/fakes exist but production storage, provider, policy, or operational wiring remains.
- Follow-up gaps should be explicit enough to choose the next slice.

## 11. Commit Discipline

Commit as work progresses:

- Commit substantial plans before coding.
- Commit contracts and generated artifacts together.
- Commit tests with the implementation they verify.
- Commit docs/roadmap updates after the behavior lands.
- Commit formatting cleanup separately if it is not part of the behavioral diff.

Before each commit:

- Run the targeted check for the touched package or service.
- Review `git diff --stat` and relevant diffs.
- Avoid staging unrelated user changes.
- Use concise conventional commit messages, such as:
  - `docs(meetings): plan review API desktop slice`
  - `feat(contracts): add meeting review schemas`
  - `feat(api): add meeting review endpoints`
  - `style(meetings): format review API files`

## 12. Security and Privacy Guardrails

Agents must not:

- Implement features that bypass consent, proctoring, monitoring, access controls, or platform policy.
- Add cloud or provider data flows without updating data-flow documentation.
- Add cross-workspace queries without explicit authz tests.
- Log raw transcript, prompt, document, suggestion, token, or raw audio content by default.
- Add AI prompts without prompt versioning and evaluation notes.
- Add integrations without credential isolation and revoke behavior.
- Add production infrastructure without IaC documentation.

Workspace isolation rules:

- Every customer-owned record must carry or be scoped by `workspace_id`.
- Every request must authorize workspace membership before repository reads or writes.
- PostgreSQL-backed tenant data should use `withWorkspaceTransaction` or an equivalent RLS-scoped path.
- In-memory fakes are acceptable for local/test slices only when the production repository is explicitly tracked as follow-up.

## 13. Living Lessons

Record repeated process lessons here so future sessions start stronger.

- Contract-first slices work well when schemas, generated JSON Schema artifacts, API tests, desktop client tests, and UI wiring are committed separately.
- For early verticals, an injectable repository with an in-memory implementation can unblock contracts and UI while keeping PostgreSQL wiring as an explicit follow-up. The roadmap must state that limitation.
- Do not store transcript text in browser `localStorage` or diagnostics. Use in-memory state or live-only channels unless a retention-governed storage path exists.
- Treat generated schema drift as part of the contract verification gate.
- Keep roadmaps honest: "partially implemented" is better than implying production readiness when only local/test wiring exists.
- Prettier failures are cheap to fix but should be committed explicitly when they touch already-committed behavioral files.
- When exact optional property typing fails, prefer conditional object construction over weakening types.

## 14. Updating This Workflow

Update this file when:

- A repeated failure happens twice.
- A new skill is added.
- A new class of feature needs a different context-loading matrix row.
- A verification command becomes mandatory.
- A commit or documentation convention changes.
- A roadmap slice exposes ambiguity in the existing process.
