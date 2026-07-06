# Dokeza Agent Development Workflow

## 1. Purpose

This document is the living operating playbook for building Dokeza with an AI coding agent. It defines the repeatable flow from selecting the next feature slice through planning, context loading, implementation, testing, debugging, verification, documentation, and commits.

The goal is to keep agent work efficient, auditable, and aligned with Dokeza's roadmap, security model, and production-readiness bar. Update this document when repeated work reveals a better process or a recurring failure mode.

Sources reviewed:

- Antithesis "skills for agents" blog: `https://antithesis.com/blog/2026/agent_skills/`
- Antithesis skills repository: `https://github.com/antithesishq/antithesis-skills`
- Superpowers repository: `https://github.com/obra/superpowers`
- User-provided "LOOPS.md: Field Notes on Agents That Run for Days" image, reviewed 2026-07-03.

## 2. Operating Principles

Agents should optimize for steady, verified progress over large unreviewable changes.

- Treat the development process as a loop, not a one-off prompt. The loop is: gather, reason, act, verify, repeat.
- Start from the roadmap, not from convenient code.
- Load only the context needed for the slice, but load all required security and architecture context for that slice.
- Keep each slice independently verifiable.
- Keep durable loop state simple enough to recover after a crash or context reset.
- Prefer contracts, repository interfaces, and adapters that make later production wiring possible without client churn.
- Separate builder and evaluator mindsets. A change is not accepted because the author likes it; it is accepted because the agreed contract, tests, and review gates pass.
- Use tests as the executable definition of behavior whenever practical.
- Keep transcript, prompt, document, suggestion, token, and raw audio content out of logs, diagnostics, and telemetry by default.
- Commit meaningful checkpoints as work progresses.
- Update documentation in the same slice that changes behavior, contracts, data flows, or user workflows.
- Watch the bottleneck. When coding gets easy, planning, verification, UX judgment, or documentation usually becomes the constraint.

## 3. Canonical Loop

Use this loop for every non-trivial feature.

1. Identify the slice.
   - Start from `docs/development/plans/2026-06-25-production-vertical-roadmap.md`.
   - Check `docs/development/progress.md` for the current checklist state.
   - Name the milestone, requirement IDs, user-visible behavior, and acceptance criteria.
   - Prefer the smallest vertical step that makes the product more complete.

2. Inspect repo state.
   - Run `git status --short`.
   - Review recent commits when continuing after user changes.
   - Do not overwrite unrelated user changes.

3. Reconstruct loop state.
   - Confirm the current roadmap status.
   - Confirm the current progress checklist status.
   - Read the active slice plan, if one exists.
   - Review recent commits and `git status --short`.
   - If the current state cannot be understood from progress, roadmap, plan, and git state, simplify or document it before coding.

4. Load context.
   - Read `AGENTS.md`.
   - Read the roadmap and the slice-specific plan if it exists.
   - Read the relevant SRS, architecture, security, DevOps, and testing docs.
   - Read relevant project-local skills under `.codex/skills/`.

5. Select skills.
   - Use `dokeza-implementation-planning` for multi-file, architecture-affecting, contract, security, or user-workflow changes.
   - Use `dokeza-tdd-execution` for implementation.
   - Use `dokeza-systematic-debugging` for any failing test, typecheck, build, or unexpected behavior.
   - Use `dokeza-verification-before-completion` before claiming completion.
   - Use domain skills such as `dokeza-data-governance`, `dokeza-provider-integration`, `dokeza-reliability-testing`, or `dokeza-desktop-realtime-client` when the slice touches those areas.

6. Plan.
   - For substantial work, create or update a plan under `docs/development/plans/YYYY-MM-DD-<feature-name>.md`.
   - Include goal, requirements, affected architecture, contracts/data model, security/privacy, implementation tasks, tests, docs, rollback/degraded behavior, and open questions.
   - Write the done contract as testable assertions before implementation begins.
   - Commit the plan before implementation when it is substantial.

7. Implement in checkpoints.
   - Write or update tests first where practical.
   - Implement the smallest behavior that satisfies the tests.
   - Run targeted verification.
   - Commit a coherent checkpoint.
   - Repeat.

8. Debug systematically.
   - Read the full error.
   - Reproduce with the exact failing command.
   - Identify root cause before editing.
   - Fix at the source, not only at the symptom.
   - Add or update a regression test if the failure represents product behavior.

9. Update docs.
   - Update roadmap status after a slice lands.
   - Update `docs/development/progress.md` in the same commit when feature completion state changes.
   - Update architecture, protocol, failure-mode, data-flow, testing, or DevOps docs when their governed behavior changes.
   - Update this workflow when a repeated lesson should become standard practice.

10. Verify.
   - Run targeted checks during development.
   - Run the final verification gate before completion.
   - Read outputs and report evidence, not guesses.

11. Handoff.
    - Ensure `git status --short` is clean unless explicitly handing off known work in progress.
    - Summarize commits, verification, remaining risks, and next slice.

## 3.1 Execution Contract

For implementation requests, the default contract is not just "code compiles." The agent must leave durable, reviewable state.

- If the user asks for commits, do not finish the turn with a large uncommitted implementation unless a blocking verification failure remains. Commit coherent checkpoints as the work lands.
- If the user asks for several slices at once, split the batch into named slice boundaries before coding. Each boundary needs its own tests, docs, and commit or an explicit reason it is still work in progress.
- Before the final response, run `git status --short`. A clean worktree is the expected result after committed implementation. If the worktree is dirty, name every remaining file group and why it is intentionally uncommitted.
- The final response must identify the commits created in the turn, the verification commands that passed or failed, and any roadmap gaps left open.
- Do not rely on chat memory as the handoff. If future work depends on a decision, limitation, or next step, write it to the roadmap, the active plan, or this workflow before finalizing.

When inheriting another agent's uncommitted work:

- Start with `git status --short`, recent commits, changed-file inventory, and `git diff --stat`.
- Separate unrelated tracks before review or commit. Do not hide meeting-review, realtime, provider, or workflow changes in one catch-all commit.
- Verify generated artifacts, contracts, docs, and tests fresh in the current session.
- Fix process gaps in this workflow when the inherited work demonstrates that existing instructions were too easy to miss.
- Commit verified inherited work in coherent checkpoints instead of leaving a correct but unauditable diff behind.

## 4. Durable Loop State

The agent must be able to recover from a lost session by reading a small set of durable files and git state.

For Dokeza, the canonical state is:

1. The roadmap: `docs/development/plans/2026-06-25-production-vertical-roadmap.md`.
2. The active execution gate: `docs/development/plans/2026-07-06-production-alpha-gate.md` while production alpha is in progress.
3. The progress tracker: `docs/development/progress.md`.
4. The active slice plan under `docs/development/plans/`.
5. Git history and worktree state.

Use these instead of introducing ad hoc progress files by default. Add a temporary progress file only when a slice genuinely cannot be recovered from progress, roadmap, plan, and git state.

If state spreads across many chat messages, scratch notes, or implicit assumptions, write it down in the plan or roadmap before continuing.

## 5. Context Matrix

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
| AI prompts, retrieval, suggestions | `docs/security/threat_model.md`, `docs/testing/testing_strategy.md`, AI/retrieval architecture docs | `dokeza-rag-source-grounding`, `dokeza-data-governance`, `dokeza-provider-integration` when model providers are used |
| Infrastructure, CI, release | `docs/devops/infrastructure_architecture.md`, `docs/devops/ci_cd_release.md`, `docs/security/threat_model.md` | `dokeza-implementation-planning`, provider/security skills as needed |

If the user asks for a review rather than implementation, use a code-review stance: findings first, ordered by severity, with file and line references.

## 6. Role Separation

Longer loops work better when planning, generation, and evaluation are distinct activities even if one agent performs them.

- Planner mode: defines the slice, done contract, risks, tests, and documentation gates. It should not touch implementation code.
- Generator mode: implements the smallest change that satisfies the current contract. It should avoid grading its own work before tests and diffs exist.
- Evaluator mode: reads diffs, runs checks, compares output to the done contract, and looks for regressions, security gaps, and missing docs.

Use subagents or separate review passes when the slice is high risk, subjective, or broad. If no separate evaluator is available, explicitly switch to an evaluator pass before final verification.

Subjective work needs a rubric. For UI, documentation, prompts, and product workflows, write the evaluation axes before implementation. Useful axes include clarity, functionality, security/privacy fit, consistency with existing patterns, and operational usefulness.

## 7. Planning Gate

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
- Subjective evaluation rubric, when tests alone cannot judge quality.

Stop and update the plan if:

- A public contract must change unexpectedly.
- A new trust boundary appears.
- Workspace isolation is ambiguous.
- A new provider path is needed without data-flow documentation.
- Failure behavior is unclear.
- The implementation contradicts an ADR or roadmap decision.

## 8. Implementation Checkpoints

Prefer checkpoint commits in this order when applicable:

1. Plan or roadmap clarification.
2. Contracts and generated schema artifacts.
3. Domain/repository/service logic.
4. API or realtime server wiring.
5. Desktop/client wiring.
6. Docs and roadmap status.
7. Formatting-only cleanup when needed.

Keep checkpoints coherent. Do not mix unrelated refactors into a feature commit.

For broad requests such as "implement the next five slices," treat the phrase as permission to continue through several checkpoints, not as permission to create one oversized diff. The agent should still name each vertical, preserve roadmap order unless there is a documented reason to skip ahead, and commit after each independently reviewable slice.

If a run goes sideways, restart from the last clean contract and commit rather than layering patches on uncertain state. Restarting is acceptable when the plan remains correct; ask for user input only when the contract itself is wrong.

## 9. Testing Strategy During Work

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

## 10. Debugging Gate

When a command fails:

1. Read the entire failure output.
2. Re-run or preserve the exact failing command.
3. Inspect recent diffs and the component boundary.
4. State the root cause internally before patching.
5. Patch the smallest source-level cause.
6. Re-run the original failing command.
7. Run broader checks if the fix touched shared behavior.

Read the traces before changing the harness or prompt. In Dokeza, traces include:

- command output,
- failing test names and assertions,
- git diffs,
- generated schema diffs,
- telemetry event fields in tests,
- logs from local services when they are already part of the verification path.

When judgment diverges from expected behavior, find the exact command output, diff hunk, or assertion where the divergence began and update the contract, test, or implementation at that point.

Common recurring Dokeza failures:

- `exactOptionalPropertyTypes` rejects explicit `undefined`; omit optional fields instead.
- Contract changes require generated JSON Schema artifacts.
- Realtime protocol changes require `docs/architecture/realtime_protocol.md`.
- New failure behavior requires `docs/architecture/failure_modes.md`.
- New external data flow requires `docs/security/data_flows.md`.
- Native desktop changes require Rust verification, not just TypeScript checks.

## 11. Verification Gate

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

## 12. Documentation Gate

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

Progress tracker updates should be checkbox-compatible and conservative:

- Use `[x]` only for verified, durable implementation state.
- Use `[ ] Partial:` when a foundation exists but production storage, provider, policy, UX, or operational wiring remains.
- Use `[ ] Deferred:` for real roadmap work that is intentionally outside the current production-alpha gate.
- Split mixed items instead of combining done and open work in one checkbox.
- Keep broad verification such as `pnpm check` in the "Latest Broad Verification" section, not as a permanent feature item.

## 13. Commit Discipline

Commit as work progresses:

- Commit substantial plans before coding.
- Commit contracts and generated artifacts together.
- Commit tests with the implementation they verify.
- Commit docs/roadmap updates after the behavior lands.
- Commit `docs/development/progress.md` updates with the slice that changes completion state.
- Commit formatting cleanup separately if it is not part of the behavioral diff.
- Commit workflow/process updates when the turn exposes a missed operating rule, such as skipped commits, missing living-document updates, weak handoff state, or ambiguous slice boundaries.

Before each commit:

- Run the targeted check for the touched package or service.
- Review `git diff --stat` and relevant diffs.
- Avoid staging unrelated user changes.
- Confirm the staged diff belongs to one concern. Use multiple commits when feature tracks are interleaved.
- Use concise conventional commit messages, such as:
  - `docs(meetings): plan review API desktop slice`
  - `feat(contracts): add meeting review schemas`
  - `feat(api): add meeting review endpoints`
  - `style(meetings): format review API files`

Before final handoff after an implementation turn:

- Run the verification gate appropriate to the touched surface.
- Run `git status --short`.
- If the user requested commits and verification passes, commit all intended changes before responding.
- If unrelated user changes remain, leave them untouched and call them out explicitly.

## 14. Harness Maintenance

The workflow exists to compensate for current model, repo, and product complexity. It should shrink or change when it becomes overhead.

Review the harness when:

- The same checklist item is never useful anymore.
- A required step is routinely skipped because it is too broad.
- The agent can now do safely what the workflow previously split into multiple manual steps.
- A new bottleneck appears in planning, verification, docs, or review.

Delete or simplify stale process. A harness that only grows becomes another source of bugs.

## 15. Security and Privacy Guardrails

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

## 16. Living Lessons

Record repeated process lessons here so future sessions start stronger.

- Contract-first slices work well when schemas, generated JSON Schema artifacts, API tests, desktop client tests, and UI wiring are committed separately.
- For early verticals, an injectable repository with an in-memory implementation can unblock contracts and UI while keeping PostgreSQL wiring as an explicit follow-up. The roadmap must state that limitation.
- Do not store transcript text in browser `localStorage` or diagnostics. Use in-memory state or live-only channels unless a retention-governed storage path exists.
- Treat generated schema drift as part of the contract verification gate.
- Keep roadmaps honest: "partially implemented" is better than implying production readiness when only local/test wiring exists.
- Prettier failures are cheap to fix but should be committed explicitly when they touch already-committed behavioral files.
- When exact optional property typing fails, prefer conditional object construction over weakening types.
- Keep loop state recoverable from roadmap, active plan, and git state. If the agent needs chat memory to continue safely, write the missing state to disk.
- Plan/generate/evaluate should be separate passes. Mixing them is where weak acceptance criteria and self-approval creep in.
- When subjective quality matters, define the rubric before implementation rather than tuning by vibe after the fact.
- If the implementation accumulates patches without converging, restart from the last clean commit and done contract.
- Read failing traces before changing code. The useful clue is usually the first point where output diverged from the contract.
- Periodically delete or simplify workflow rules that no longer buy safety or speed.
- Always name the current bottleneck at handoff. The next slice should attack that bottleneck, not just the next convenient file.
- A verified implementation without commits is still an incomplete agent handoff when commits were requested. Make the repository state durable before claiming the slice is done.
- Broad multi-slice prompts need stricter, not looser, checkpoint discipline. Batch execution should produce a sequence of small reviewed commits and roadmap updates.
- When an agent misses a process step, update this workflow in the same repair turn so the harness captures the lesson instead of relying on memory.
- Source-grounded retrieval work needs one explicit checklist that couples authorization, retrieval quality, prompt safety, citations, evals, provider data flow, and retention behavior; use `dokeza-rag-source-grounding` for those slices.
- Production alpha work starts from `docs/development/plans/2026-07-06-production-alpha-gate.md`; do not widen into billing, broad admin governance, CRM/email writeback, analytics, role packs, full macOS product support, or local-first processing until the alpha gate is reliable.
- Hosted identity provider tokens belong at the API exchange boundary only. Realtime, meeting review, knowledge, and other resource APIs should continue to accept Dokeza-issued tokens, with workspace membership resolved through Dokeza-owned identity state.
- `docs/development/progress.md` is the compact checklist for completion state. Keep it checkbox-compatible, split partial work from completed foundations, and update it with the same commit as the implementation that changes status.

## 17. Updating This Workflow

Update this file when:

- A repeated failure happens twice.
- A new skill is added.
- A new class of feature needs a different context-loading matrix row.
- A verification command becomes mandatory.
- A commit or documentation convention changes.
- A roadmap slice exposes ambiguity in the existing process.
- A harness rule becomes stale or too heavy.
