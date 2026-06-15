---
name: dokeza-systematic-debugging
description: Use when encountering any bug, test failure, build error, or unexpected behavior in Dokeza before proposing fixes. Covers TypeScript services, Rust desktop native code, React UI, contracts, and cross-service issues.
---

# Dokeza Systematic Debugging

## Workflow

Announce: "I'm using the Dokeza systematic-debugging skill."

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1, you cannot propose fixes. Symptom fixes are failure.

## When to Use

Use for ANY technical issue in Dokeza:

- Test failures in `pnpm test`.
- TypeScript type errors in `pnpm typecheck`.
- Rust build errors in `cargo build`.
- Runtime crashes in desktop or backend services.
- Realtime protocol or contract mismatches.
- Performance regressions.
- CI failures.

Use this ESPECIALLY when:

- Under time pressure.
- A "quick fix" seems obvious.
- You have already tried a fix and it did not work.
- The issue spans TypeScript and Rust boundaries.
- The issue involves realtime protocol or audio pipeline.

## The Four Phases

Complete each phase before proceeding.

### Phase 1: Root Cause Investigation

BEFORE attempting ANY fix:

1. **Read error messages carefully.**
   - Full stack traces, line numbers, error codes.
   - Rust panics: read the backtrace and the panic message.
   - TypeScript: read the full type error or runtime exception.

2. **Reproduce consistently.**
   - Run the exact failing command: `pnpm test`, `pnpm typecheck`, `cargo test`.
   - Note whether it fails every time or intermittently.
   - If intermittent, suspect timing, state, or concurrency.

3. **Check recent changes.**
   - `git diff` and recent commits.
   - Dependency updates via Dependabot.
   - Contract schema changes in `packages/contracts`.
   - Config or environment changes.

4. **Gather evidence at component boundaries.**
   - For multi-service issues, trace data flow across boundaries.
   - Desktop → WebSocket → Realtime → AI Orchestrator.
   - Check what enters and exits each boundary.
   - Add diagnostic logging temporarily if needed.

5. **Trace data flow to the source.**
   - Where does the bad value originate?
   - Follow the call chain backwards.
   - Fix at source, not at symptom.

### Phase 2: Pattern Analysis

1. **Find working examples** in the same codebase.
2. **Compare** working code against broken code.
3. **List every difference**, however small.
4. **Check dependencies**: contracts, config, authz, telemetry.

### Phase 3: Hypothesis and Testing

1. **Form a single hypothesis.**
   - State clearly: "I think X is the root cause because Y."
   - Write it down.

2. **Test minimally.**
   - Make the SMALLEST possible change to test the hypothesis.
   - One variable at a time.
   - If wrong, revert and form a new hypothesis.

3. **Verify the fix.**
   - Run the original failing command.
   - Run broader checks: `pnpm check`.
   - Confirm no new failures.

### Phase 4: Prevention

After fixing:

1. **Add a test** that would have caught this.
2. **Update docs** if the failure revealed a gap.
3. **Consider whether contracts, failure modes, or data flows need updating.**

## Dokeza-Specific Debugging Paths

### Contract Mismatches

- Check `packages/contracts/src/realtime.ts` schemas.
- Run `pnpm generate:schemas` and diff the output.
- Check protocol_version matches between client and server.

### Workspace Isolation Bugs

- Trace the `workspaceId` through every function call.
- Verify `@dokeza/authz` is called before data access.
- Check that test fixtures use distinct workspace IDs.

### Telemetry Content Leaks

- Search for restricted key fragments in telemetry fields.
- Verify `redactTelemetryFields` is applied.
- Check that `contentLoggingAllowed` is false in production config.

### Audio Pipeline Issues

- Check frame assembler state: pending audio, chunk ordering.
- Verify binary frame byte_length matches metadata.
- Check audio.gap emission on buffer overflow.

## Stop Conditions

Stop and escalate when:

- The bug requires changing a contract in `packages/contracts`.
- The bug reveals a workspace isolation failure.
- The bug involves a security boundary.
- The root cause is unclear after systematic investigation.
