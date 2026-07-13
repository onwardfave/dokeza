# Dokeza Threat Model

## 1. Purpose

This document identifies major threats to Dokeza and defines baseline mitigations. It uses a STRIDE-style structure with additional AI-specific threats.

## 2. Assets

Critical assets:

- Raw audio.
- Transcripts.
- Screen context.
- Uploaded documents.
- Embeddings.
- Retrieved source chunks.
- Generated suggestions.
- Post-call summaries.
- Integration credentials.
- Calendar, CRM, ATS, support, and email data.
- Workspace policies.
- Audit logs.
- Billing and account data.

## 3. Threat Summary

| Threat | Category | Vector | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Cross-workspace data leak | Information disclosure | Missing workspace filter | Customer data exposure | Authz middleware, RLS, vector namespace isolation, tests |
| Workspace ownership takeover or lockout | Elevation of privilege / denial of service | Admin promotes an owner, removes an owner, or concurrent mutations remove the final owners | Unauthorized control or permanently ownerless workspace | Owner-only owner-role mutations, transactional membership row locks, last-owner invariant, metadata-only audit records |
| Unauthorized meeting deletion | Tampering / denial of service | Workspace member deletes another user's meeting using a known ID or stale role claim | Loss of meeting transcript and suggestions | Durable membership revalidation, creator-or-admin/owner rule, RLS transaction, atomic metadata-only audit |
| Restricted document disclosure | Information disclosure | Workspace member lists, opens, keyword-searches, or vector-searches a tagged chunk without matching permission | Confidential source content or metadata enters UI/model prompt | Fail-closed tag evaluation in every repository read path, creator/owner/admin override, SQL prefilter plus result revalidation, not-found response |
| Prompt injection through transcript | Tampering | Meeting participant speaks malicious instruction | Model ignores system rules or reveals data | Prompt hardening, input labeling, source-access checks, output validation |
| Prompt injection through documents | Tampering | Malicious uploaded doc | Retrieval causes unsafe model behavior | Treat retrieved docs as untrusted, delimit sources, block tool instructions from docs |
| Unauthorized document retrieval | Information disclosure | Permission bug | User sees restricted knowledge | Permission-aware retrieval and revalidation |
| OAuth token theft | Elevation of privilege | Compromised app or backend access | External systems compromised | Secrets manager, encryption, scoped tokens, rotation |
| Desktop token theft | Elevation of privilege | Malware on endpoint | Account compromise | Platform keychain, short-lived tokens, refresh rotation |
| Audio interception | Information disclosure | Network interception | Meeting content leaked | TLS, certificate validation, optional pinning |
| Insider transcript access | Information disclosure | Internal DB query | Privacy violation | Least privilege, audit logs, restricted production access |
| Replay of audio frames | Spoofing | Captured frames resent | Corrupt transcript/session | Session tokens, sequence numbers, timestamps |
| Fake client session | Spoofing | Stolen or forged token | Unauthorized processing | Short-lived tokens, device binding where feasible |
| Desktop OAuth navigation or callback interception | Spoofing / Elevation of privilege | Untrusted WebView navigation, unsafe URL scheme, or a malicious local process racing the loopback callback | Account compromise or wrong account binding | Supported system-browser opener scoped to HTTPS Auth0 tenant URLs and main window, no embedded login, Authorization Code with PKCE, high-entropy state/nonce, exact callback allowlist, short listener lifetime, no client secret, sanitized retry |
| Overbroad desktop network policy | Information disclosure | Production WebView connects to an undeclared cleartext or wildcard endpoint | Tokens or customer content leave the intended service boundary | Build-generated exact-origin CSP; production requires HTTPS/WSS and fails closed on missing or cleartext endpoints |
| LLM provider outage | Denial of service | Provider failure | Suggestions unavailable | Provider abstraction, fallback models, degraded mode |
| Cost abuse | Denial of wallet | Excessive requests | Margin loss | Rate limits, quotas, debounce, usage metering |
| Integration writeback mistake | Tampering | Bad generated CRM update | Customer system corruption | User approval, audit logs, structured validation |
| Sensitive telemetry leak | Information disclosure | Logging raw prompts | Privacy breach | Redacted logs, debug mode controls |
| Auto-update compromise | Tampering | Malicious update | Endpoint compromise | Signed updates, secure updater, rollback |

## 4. STRIDE Analysis

### 4.1 Spoofing

Risks:

- Unauthorized client connects to realtime service.
- Attacker reuses stolen session token.
- Malicious integration callback impersonates provider.

Mitigations:

- Short-lived session tokens.
- TLS everywhere.
- OAuth state verification.
- PKCE and nonce validation for desktop hosted sign-in.
- Signed webhook verification.
- Device identity for desktop sessions where feasible.

### 4.2 Tampering

Risks:

- Prompt injection through transcript or documents.
- Modified local cache.
- Tampered update package.
- Manipulated integration payloads.

Mitigations:

- Signed auto-updates.
- Server-side validation of all client messages.
- Prompt and source delimiters.
- Structured output validation.
- Approval workflows before external writeback.

### 4.3 Repudiation

Risks:

- User denies approving CRM writeback.
- Admin denies changing retention policy.
- Internal operator access is not attributable.

Mitigations:

- Audit logs for admin and writeback actions.
- Actor, timestamp, source IP, and target resource on sensitive events.
- Immutable or append-only audit storage for enterprise tier.

### 4.4 Information Disclosure

Risks:

- Cross-workspace data leakage.
- Unauthorized document retrieval.
- Sensitive content in logs.
- Third-party provider retention mismatch.
- Insider access to transcripts.

Mitigations:

- Workspace-scoped authorization.
- Vector retrieval revalidation.
- Redacted telemetry by default.
- Provider retention controls.
- Production access controls and audit.

### 4.5 Denial of Service

Risks:

- STT provider unavailable.
- LLM provider unavailable.
- WebSocket overload.
- Large document ingestion overload.
- Excessive user-triggered suggestions.

Mitigations:

- Degraded modes.
- Rate limits.
- Queue-based ingestion.
- Provider fallback.
- Backpressure protocol.
- Usage quotas.

### 4.6 Elevation of Privilege

Risks:

- User accesses admin-only workspace controls.
- Integration token used outside owning workspace.
- Support operator gains broad customer data access.

Mitigations:

- Role-based access control.
- Secrets manager with workspace binding.
- Internal access grants with time limits.
- Authorization tests.

## 5. AI-Specific Controls

The AI orchestrator shall:

- Treat transcript, retrieved documents, and screen text as untrusted input.
- Keep system instructions separate from user and source content.
- Prevent retrieved documents from issuing tool or policy instructions.
- Validate user authorization for every source before prompt assembly.
- Validate structured outputs against schemas.
- Label ungrounded answers.
- Avoid generating unsupported factual claims when source material is missing.

## 6. Security Verification

Required tests and reviews:

- Cross-workspace authorization tests.
- Vector retrieval isolation tests.
- Prompt injection evaluation set.
- OAuth scope and callback tests.
- Secrets access review.
- Signed update verification.
- Log redaction tests.
- Retention and deletion tests.
- Incident response tabletop exercise.
