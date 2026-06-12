# ADR 0002: Backend Runtime and Contract Strategy

## Status

Accepted for initial implementation.

## Context

Dokeza needs backend services for REST APIs, realtime sessions, AI orchestration, knowledge retrieval, workflows, billing, and governance. The desktop and web clients are TypeScript-facing, while future backend services may benefit from Go for performance-sensitive or infrastructure-heavy workloads.

The implementation must let desktop and backend teams share contracts without making every future service depend on TypeScript.

## Decision

Use TypeScript/Node.js for the initial backend services in the monorepo.

TypeScript schemas in `packages/contracts` are the source format for early implementation. Every public or cross-process contract must also generate JSON Schema artifacts for language-neutral validation and compatibility testing.

Go may be introduced later only behind stable contract boundaries. A Go service must consume generated JSON Schema or another language-neutral schema artifact rather than redefining protocol shapes by hand.

## Rationale

TypeScript reduces early coordination cost across the React desktop UI, web app, shared contracts, and backend services. It also lets the first implementation move quickly while the product and protocol are still changing.

Generated JSON Schema keeps the architecture from becoming TypeScript-only at the system boundary. It gives desktop, backend, test, and future Go services a common validation artifact.

## Consequences

- Backend implementation plans should assume TypeScript/Node.js unless a new ADR approves an exception.
- Contract tests must validate generated JSON Schema artifacts, not only TypeScript types.
- Service boundaries must remain modular so later Go services can replace TypeScript services without changing clients.
- Runtime-specific framework objects must not leak into domain modules.
