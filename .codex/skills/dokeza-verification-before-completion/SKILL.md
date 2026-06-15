---
name: dokeza-verification-before-completion
description: Use when about to claim work is complete, tests pass, or a feature is working. Requires running verification commands and confirming output with evidence before making any success claims.
---

# Dokeza Verification Before Completion

## Workflow

Announce: "I'm using the Dokeza verification-before-completion skill."

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you have not run the verification command in this session, you cannot claim it passes.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete).
3. READ: Full output, check exit code, count failures.
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence.
   - If YES: State claim WITH evidence.
5. ONLY THEN: Make the claim.

Skip any step = lying, not verifying.
```

## Dokeza Verification Commands

| Claim | Required Command | Not Sufficient |
| --- | --- | --- |
| Tests pass | `pnpm test` | Previous run, "should pass" |
| Types check | `pnpm typecheck` | Tests passing |
| Lint clean | `pnpm lint` | Types passing |
| Format correct | `pnpm format:check` | Lint passing |
| All checks pass | `pnpm check` | Any single check |
| Rust builds | `cargo build` in `apps/desktop/src-tauri` | TypeScript checks |
| Rust tests pass | `cargo test` in `apps/desktop/src-tauri` | Cargo build |
| Desktop builds | `pnpm --filter @dokeza/desktop build` | Backend tests |
| Schemas current | `pnpm generate:schemas` then diff | Types passing |

## Common Failures

- Using "should", "probably", "seems to" instead of evidence.
- Expressing satisfaction before verification ("Great!", "Done!").
- About to commit or push without running `pnpm check`.
- Trusting that a file creation succeeded without running tests.
- Assuming Rust and TypeScript are both fine after checking only one.

## The Full Gate for Dokeza

Before claiming a task is complete:

1. Run `pnpm check` (format, lint, typecheck, test).
2. Read the output. Zero failures, zero warnings.
3. If the change touches Rust: run `cargo test` in `apps/desktop/src-tauri`.
4. If the change touches contracts: run `pnpm generate:schemas` and verify no unexpected diff.
5. State: "Verified: `pnpm check` passed with [N] test suites, 0 failures."

## Evidence Format

When reporting verification results:

```
Verified: pnpm check passed.
- Format: clean
- Lint: 0 warnings, 0 errors
- Typecheck: 0 errors across [N] projects
- Tests: [N] passed, 0 failed
```

If anything fails, report the actual status:

```
Verification failed:
- Tests: 14 passed, 2 failed
- Failures:
  - services/realtime/src/ws-server.test.ts: connection timeout
  - packages/contracts/src/realtime.test.ts: schema mismatch
```

## Integration with Other Skills

- After `dokeza-tdd-execution`: run verification gate before marking task complete.
- After `dokeza-systematic-debugging`: run verification gate to confirm the fix.
- After `dokeza-implementation-planning`: no verification needed (docs only).
