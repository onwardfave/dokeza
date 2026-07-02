# Dokeza Testing Strategy

## 1. Purpose

This document defines how Dokeza will be tested across deterministic unit tests, integration tests, contract tests, AI evaluations, desktop QA, security tests, and reliability/property tests.

## 2. Testing Principles

- Tests should prove product behavior, not implementation trivia.
- Contract tests protect parallel desktop/backend development.
- Security and authorization tests are required, not optional.
- AI behavior must be evaluated with repeatable datasets.
- Failure modes must be tested before production.
- Use property and fault testing for stateful, concurrent, and distributed paths.

The property-testing and workload-testing approach is inspired by Antithesis' public skill workflow: research the system, define reliability properties, define a minimal topology, build workloads, then triage failures.

## 3. Test Pyramid

| Layer | Purpose | Examples |
| --- | --- | --- |
| Unit | Fast validation of pure logic | Prompt assembly, authz checks, retention rules |
| Component | Module with fake dependencies | Context manager, transcript processor, retrieval coordinator |
| Contract | Client/server compatibility | Realtime messages, REST APIs, webhooks |
| Integration | Real dependency or containerized dependency | PostgreSQL, vector store, object storage, OAuth sandbox |
| E2E | Full user workflow | Start session, transcript, suggestion, post-call output |
| AI eval | Model behavior quality | Source-grounded Q&A, summary accuracy, hallucination checks |
| Reliability | Fault and property testing | reconnect, backpressure, provider failure, retry safety |
| Manual QA | Human experience and platform behavior | overlay, audio devices, meeting apps |

## 4. Required Test Suites

### 4.1 Desktop

- Permission onboarding.
- Overlay behavior.
- Global hotkeys.
- Audio device selection.
- Native audio diagnostics for microphone, output-device enumeration, and Windows loopback probes.
- Device disconnect recovery.
- Local cache writes.
- Redacted local crash diagnostics.
- Native realtime WebSocket diagnostics with synthetic frames.
- Update deferral policy and desktop release configuration validation.
- Realtime reconnect.
- Update deferral during active meeting.
- Rollback smoke test.

### 4.2 Realtime

- WebSocket authentication.
- Realtime token validation for expiration, purpose, workspace, user, and resume identity.
- Session start/end lifecycle.
- Audio frame handling.
- Transcript partial/final ordering.
- Suggestion streaming.
- Sequence number handling.
- Reconnect/resume.
- Backpressure.

### 4.3 Knowledge and Retrieval

- Document parsing.
- Chunking.
- Embedding creation.
- Hybrid search.
- Reranking.
- Permission-aware retrieval.
- Deleted-document exclusion.
- Source metadata propagation.

### 4.4 AI Orchestration

- Prompt template versioning.
- Model routing.
- Structured output validation.
- Source-grounded answer checks.
- Unsupported-answer uncertainty behavior.
- Token budget enforcement.
- Cost telemetry.

### 4.5 Security

- Workspace isolation.
- Authentication token validation and hosted-IdP failure handling.
- Role-based access control.
- Vector retrieval isolation.
- Signed URL authorization.
- Integration credential isolation.
- Audit log emission.
- Retention and deletion.
- Prompt injection regression tests.

### 4.6 Integrations

- OAuth connect and revoke.
- Calendar read.
- Email draft creation.
- CRM read.
- CRM update draft.
- Writeback approval.
- Rate-limit handling.
- Expired-token recovery.

## 5. Reliability and Property Testing

Property tests should focus on invariants:

- A user can never access data outside authorized workspaces.
- A source-grounded answer can only cite sources the user can access.
- Reconnection preserves a single session identity.
- Retried writeback cannot duplicate externally visible updates without explicit idempotency key.
- Retention deletes all derived meeting artifacts.
- Backpressure cannot crash the desktop client.
- Prompt injection from transcript or documents cannot override system policy.

Reliability workloads should exercise:

- Network drops.
- STT timeout.
- LLM timeout.
- Provider rate limits.
- Database restart.
- Queue delay.
- OAuth expiration.
- Audio device changes.
- Large document ingestion.

## 6. AI Evaluation

Maintain versioned evaluation sets for:

- Sales Q&A.
- Customer success escalation.
- Recruiting follow-up questions.
- Support troubleshooting.
- Internal meeting summaries.
- Source-grounded answers.
- Prompt injection attempts.

Each evaluation should record:

- Prompt version.
- Model.
- Retrieval inputs.
- Expected behavior.
- Actual output.
- Human or automated score.
- Failure classification.

## 7. Release Test Gates

Before internal beta:

- Unit, contract, and integration tests pass.
- Desktop install and session smoke test pass on Windows and macOS.
- Realtime reconnect test passes.
- Basic AI eval suite passes.

Before public beta:

- Failure injection suite passes.
- Authz and workspace isolation tests pass.
- Prompt injection regression suite exists.
- Desktop update deferral test passes.
- Crash-free session rate exceeds target.

Before paid production:

- Load tests meet target.
- Backup restore drill succeeds.
- Billing reconciliation test passes.
- Retention and deletion tests pass.
- Security review gates pass.
