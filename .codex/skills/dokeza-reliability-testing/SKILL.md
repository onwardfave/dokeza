---
name: dokeza-reliability-testing
description: Design and implement Dokeza reliability, property, fault-injection, and workload tests. Use for realtime sessions, reconnect/resume, workspace isolation, retrieval permissions, retention/deletion, provider failures, integration writeback, queues, distributed state, or any stateful/concurrent behavior.
---

# Dokeza Reliability Testing

## Workflow

Announce: "I'm using the Dokeza reliability-testing skill."

1. Research the system under test:
   - Architecture boundaries.
   - State transitions.
   - Concurrency.
   - External dependencies.
   - Failure-prone paths.
2. Define testable properties.
3. Define the minimal useful test topology.
4. Build workloads that exercise the properties.
5. Add assertions at system boundaries.
6. Run fault scenarios.
7. Triage failures with logs, traces, event timelines, and persisted state.

## Property Catalog Template

Save substantial catalogs under:

```text
docs/testing/property-catalogs/<component>.md
```

Use this structure:

```markdown
# <Component> Property Catalog

## System Under Test
## State and Concurrency Model
## Properties
## Minimal Test Topology
## Workloads
## Faults to Inject
## Observability Needed
## Open Risks
```

## Default Dokeza Properties

Start from these invariants:

- No user can access another workspace's data.
- Retrieval cannot return unauthorized chunks.
- Source-grounded answers can only cite authorized sources.
- Reconnect preserves one session identity.
- Retries cannot duplicate writeback without idempotency.
- Retention deletes derived artifacts.
- Provider failure degrades without crashing.
- Prompt injection cannot override system policy.

## Faults to Exercise

- Network drop.
- WebSocket reconnect.
- STT timeout.
- LLM timeout.
- Retrieval timeout.
- Database restart.
- Queue delay.
- OAuth expiration.
- Audio device disconnect.
- Local disk full.

