# Dokeza Agent Development Workflow

## 1. Purpose

This document defines how AI coding agents should help build Dokeza. It adapts the useful parts of Superpowers and Antithesis-style skills into a Dokeza-specific workflow.

Sources reviewed:

- Antithesis "skills for agents" blog: `https://antithesis.com/blog/2026/agent_skills/`
- Antithesis skills repository: `https://github.com/antithesishq/antithesis-skills`
- Superpowers repository: `https://github.com/obra/superpowers`

## 2. Adopted Practices

From Superpowers, Dokeza adopts:

- Spec-first development.
- Brainstorm and clarify before implementation when requirements are ambiguous.
- Write an implementation plan before major changes.
- Use true red/green TDD when behavior is testable.
- Review early and often.
- Keep implementation tasks small and verifiable.
- Use isolated branches or worktrees once this repo is under Git.

From Antithesis skills, Dokeza adopts:

- Research the system before designing reliability tests.
- Produce property catalogs for stateful or distributed components.
- Define a minimal test topology.
- Build workloads that exercise properties.
- Triage reliability failures with evidence from logs, traces, and timelines.

## 3. Project-Local Skills

The repo includes project-local skills under `.codex/skills/`:

- `dokeza-implementation-planning`: use before implementing non-trivial features.
- `dokeza-tdd-execution`: use while implementing planned features.
- `dokeza-reliability-testing`: use when designing or implementing reliability, fault, property, or chaos-style tests.
- `dokeza-systematic-debugging`: use when encountering any bug, test failure, or unexpected behavior before proposing fixes.
- `dokeza-verification-before-completion`: use before claiming work is complete; requires running verification commands and confirming output with evidence.

These skills are intentionally Dokeza-specific. They reference this repo's SRS, architecture, security, testing, and DevOps docs.

## 4. Required Development Flow

For substantial changes:

1. Read the relevant requirements and architecture docs.
2. Identify affected contracts, policies, trust boundaries, and tests.
3. Write or update an implementation plan.
4. Write failing tests or evaluation cases first where practical.
5. Implement the smallest useful slice.
6. Run targeted verification.
7. Request review or perform review checklist.
8. Update docs when architecture, contracts, infra, security, or workflows change.

## 5. Documentation Gates

Implementation may require doc updates when:

- A service boundary changes.
- A public API or realtime message changes.
- A workspace policy changes.
- A data flow crosses a new trust boundary.
- A new provider is added.
- A new deployment dependency is added.
- A failure mode changes.
- A user-visible workflow changes.

## 6. Agent Guardrails

Agents must not:

- Implement features that bypass consent, proctoring, monitoring, or platform policy.
- Add cloud data flows without updating data-flow documentation.
- Add cross-workspace queries without explicit authz tests.
- Add AI prompts without prompt versioning and evaluation notes.
- Add integrations without credential isolation and revoke behavior.
- Add production infrastructure without IaC documentation.
