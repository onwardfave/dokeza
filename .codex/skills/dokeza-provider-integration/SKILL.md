---
name: dokeza-provider-integration
description: Implement or modify Dokeza external provider adapters safely. Use for STT, LLM, embedding, reranking, billing, OAuth, CRM, ATS, email, calendar, support, or other third-party integrations; provider config, credentials, telemetry, retries, failure behavior, tests, or data-flow documentation.
---

# Dokeza Provider Integration

## Workflow

Announce: "I'm using the Dokeza provider-integration skill."

1. Identify the provider, capability, data class, and execution location: `cloud`, `local`, or `hybrid`.
2. Read the affected architecture, security, failure-mode, and testing docs before implementation.
3. Keep the provider behind an internal adapter interface owned by the service domain.
4. Keep credentials server-side or in the approved credential boundary. Do not expose provider API keys to desktop, browser, telemetry, tests, or errors.
5. Write tests with fake transports or provider sandboxes. Do not call live providers from unit tests or default CI.
6. Map provider responses into Dokeza contracts at the boundary. Do not leak provider-specific shapes past the adapter unless explicitly documented.
7. Emit metadata-only telemetry for latency, provider, model, route, status, retry count, and error category.
8. Map failures to documented recoverable or unrecoverable behavior. Update `docs/architecture/failure_modes.md` if user-visible behavior changes.
9. Update `docs/security/data_flows.md` for any new or materially changed external data flow.
10. Run focused provider tests, affected package typechecks, then `pnpm check` before completion.

## Design Rules

- Use explicit workspace and session identifiers in adapter inputs where customer data is processed.
- Treat raw audio, transcript text, prompts, documents, suggestions, provider payload bodies, and generated content as restricted content.
- Prefer dependency-injected transports for deterministic tests.
- Validate provider configuration at startup through `@dokeza/config`.
- Use bounded timeouts and retry metadata; avoid unbounded reconnect loops.
- Preserve Dokeza realtime and REST contracts unless the plan explicitly includes a contract change.
- Keep local/test defaults synthetic and credential-free.

## Review Checklist

Before committing:

- Tests prove success, provider failure, timeout/reconnect where applicable, and telemetry redaction.
- Logs and telemetry exclude restricted content and secrets.
- Production config fails closed when required provider credentials or TLS settings are missing.
- Data-flow, failure-mode, protocol, or DevOps docs are updated when their gate conditions apply.
- Live provider calls are opt-in and never required for `pnpm check`.
