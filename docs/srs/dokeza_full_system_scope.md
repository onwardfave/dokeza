# Dokeza Full System Scope and Delivery Plan

## 1. Purpose

Dokeza is a real-time AI work copilot for live professional conversations. It listens to authorized meeting context, understands active work, retrieves relevant organizational knowledge, and helps users respond, decide, follow up, and improve.

This document scopes Dokeza as a fully-fledged product and platform, not an MVP. It defines product verticals, platform verticals, milestones, deliverables, verification criteria, operating requirements, and release gates.

## 2. Product Thesis

Most meeting assistants help after a call. Dokeza should help before, during, and after the call.

Dokeza should win by being:

- Real-time: useful suggestions arrive while the user can still act.
- Contextual: answers come from the user's company, customer, calendar, CRM, prior calls, and active screen context.
- Trustworthy: answers are source-grounded, concise, and honest about uncertainty.
- Operational: meeting outputs flow into email, CRM, Slack, ATS, support systems, and task tools.
- Governable: teams control data capture, retention, permissions, model providers, and integrations.
- Polished: the desktop client feels fast, quiet, stable, and native.

Dokeza should not be scoped as a tool for evading disclosure, proctoring, platform policy, or security controls. Display privacy features may protect sensitive internal notes from accidental exposure, but must not be designed or marketed as evasion.

## 3. System Goals

### 3.1 Business Goals

- Create a differentiated real-time copilot that competes with and surpasses meeting assistant products.
- Support high-value professional workflows in sales, customer success, recruiting, consulting, support, and internal operations.
- Enable both individual adoption and enterprise deployment.
- Build durable advantage through retrieval quality, workflow integrations, and team-level memory.
- Support pricing expansion through individual, team, business, and enterprise tiers.

### 3.2 Product Goals

- Provide live suggestions with a P95 first useful response under 3 seconds.
- Generate source-grounded answers from approved knowledge.
- Produce post-call outputs that require minimal user editing.
- Provide pre-call briefs based on calendar, account, participant, and prior-meeting context.
- Offer role-specific workflows rather than a generic chat overlay.
- Make capture, storage, and AI usage transparent and controllable.

### 3.3 Engineering Goals

- Build a modular system with independently testable capture, transcription, context, retrieval, orchestration, and output layers.
- Support Windows and macOS desktop clients.
- Support cloud-first processing with optional local-first capabilities over time.
- Maintain strong observability across latency, cost, quality, and reliability.
- Support enterprise security review, auditability, retention, and access control.
- Keep model providers swappable behind internal interfaces.

## 4. Product Principles

- The live experience must be quiet. Dokeza should help when useful and stay out of the way otherwise.
- Suggestions must be speakable. Live output should be short enough to use during a conversation.
- Sources matter. If Dokeza gives a factual company answer, it should know where that answer came from.
- Users must stay in control. They can start, stop, pause, delete, export, and configure capture.
- Admins must be able to govern. Enterprise adoption requires policy controls, audit logs, and clear data handling.
- Integrations are product surface, not plumbing. The value is in closing the loop after the meeting.

## 5. Scope Overview

Dokeza consists of three major product surfaces:

1. Desktop Copilot: live capture, transcript, overlay, suggestions, and local controls.
2. Web Workspace: knowledge base, meetings, integrations, admin, analytics, billing, and settings.
3. Backend Platform: realtime services, retrieval, LLM orchestration, storage, workflows, observability, and compliance infrastructure.

The full system scope is supported by these engineering specifications:

- `docs/architecture/c4_architecture.md`
- `docs/architecture/code_architecture.md`
- `docs/architecture/authentication.md`
- `docs/architecture/adr/0001-desktop-shell-tauri-v2.md`
- `docs/architecture/adr/0002-backend-runtime-and-contracts.md`
- `docs/architecture/adr/0003-data-store-vector-and-workflow-baseline.md`
- `docs/architecture/adr/0004-realtime-audio-routing-and-framing.md`
- `docs/architecture/adr/0005-initial-provider-and-retention-defaults.md`
- `docs/architecture/realtime_protocol.md`
- `docs/architecture/failure_modes.md`
- `docs/architecture/multi_tenancy.md`
- `docs/devops/infrastructure_architecture.md`
- `docs/devops/ci_cd_release.md`
- `docs/security/data_flows.md`
- `docs/security/threat_model.md`
- `docs/testing/testing_strategy.md`
- `docs/development/agent_workflow.md`
- `docs/srs/traceability_matrix.md`

## 6. Customer-Facing Product Verticals

### 6.1 Sales Copilot

Purpose: Help sales teams prepare for calls, handle objections, answer product questions, and follow up quickly.

Core capabilities:

- Pre-call account brief.
- Prospect and company research summary.
- Pricing, security, integration, and implementation answers.
- Objection handling.
- Competitive battlecards.
- Follow-up email generation.
- CRM note and field update suggestions.
- Deal-risk detection.

Verifiable deliverables:

- Given a connected CRM account and calendar event, Dokeza generates a pre-call brief with account, contact, prior notes, open opportunities, and suggested agenda.
- Given a live pricing objection, Dokeza produces two concise objection responses in under 3 seconds.
- Given a completed sales call, Dokeza produces a summary, MEDDICC/BANT-style qualification fields where configured, action items, and a CRM-ready update.
- Given a question answerable from an approved sales document, Dokeza includes source metadata.

### 6.2 Customer Success Copilot

Purpose: Help teams run customer check-ins, detect risk, track commitments, and maintain account memory.

Core capabilities:

- Account health brief.
- Renewal and usage context.
- Support ticket and escalation context.
- Risk and sentiment detection.
- Commitment tracking.
- Next-step and success-plan updates.
- Executive business review support.

Verifiable deliverables:

- Given customer meeting history, Dokeza identifies unresolved action items from prior calls.
- Given a live escalation, Dokeza surfaces relevant support history or knowledge-base answers.
- Given a completed customer call, Dokeza creates a customer-facing recap and internal risk notes.
- Given configured account fields, Dokeza proposes updates without overwriting records automatically.

### 6.3 Recruiting Copilot

Purpose: Help recruiting and hiring teams run permitted AI-assisted screens and interviews with structured, fair, and documented notes.

Core capabilities:

- Candidate brief from resume, role, and prior notes.
- Structured interview guide.
- Follow-up question suggestions.
- Scorecard draft.
- Candidate summary and next-step draft.
- ATS update suggestions.

Verifiable deliverables:

- Given a candidate resume and job description, Dokeza generates a structured interview plan.
- Given a candidate answer, Dokeza suggests one relevant follow-up question tied to the role criteria.
- Given a completed call, Dokeza generates a scorecard draft with evidence-linked notes.
- Given a workspace policy requiring disclosure, the product surfaces the configured AI-assistance notice before session start.

### 6.4 Consulting Copilot

Purpose: Help consultants and client-facing experts retain client context, answer from internal expertise, and produce deliverables.

Core capabilities:

- Client brief.
- Engagement context.
- Prior decision and open-risk recall.
- Internal knowledge retrieval.
- Meeting recap.
- Workstream updates.
- Deliverable outline generation.

Verifiable deliverables:

- Given client-specific knowledge and prior meeting notes, Dokeza generates a brief before a consulting session.
- Given a live client question, Dokeza retrieves relevant internal guidance with source metadata.
- Given a completed meeting, Dokeza creates internal notes and client-ready recap variants.
- Given action items, Dokeza groups them by workstream.

### 6.5 Support and Solutions Copilot

Purpose: Help support engineers, solutions engineers, and technical account teams answer technical questions and resolve issues.

Core capabilities:

- Technical knowledge retrieval.
- Troubleshooting playbooks.
- Incident context.
- Product limitation and workaround answers.
- Escalation summary.
- Ticket update suggestions.

Verifiable deliverables:

- Given a product question, Dokeza retrieves the relevant support article or internal runbook.
- Given an unresolved technical issue, Dokeza creates an escalation summary with reproduction steps and customer impact.
- Given a completed support call, Dokeza proposes ticket updates and follow-up actions.
- Given insufficient source material, Dokeza states uncertainty instead of inventing an answer.

### 6.6 Internal Meetings Copilot

Purpose: Help teams run internal meetings with better decisions, action items, accountability, and institutional memory.

Core capabilities:

- Agenda brief.
- Decision tracking.
- Action item extraction.
- Open question tracking.
- Status update summary.
- Slack or email recap.
- Project memory.

Verifiable deliverables:

- Given a recurring internal meeting, Dokeza shows prior decisions and unresolved action items.
- Given a live discussion, Dokeza detects decisions and action items with timestamps.
- Given a completed meeting, Dokeza creates a concise recap and owner-assigned action list.
- Given a project workspace, Dokeza stores meeting memory according to retention policy.

## 7. Platform Verticals

### 7.1 Desktop Client Platform

Scope:

- Windows desktop app.
- macOS desktop app.
- Main app window.
- Live overlay or side panel.
- Global hotkeys.
- Local settings.
- Local cache.
- Diagnostics.
- Auto-update.

Deliverables:

- Signed installers for Windows and macOS.
- Permission onboarding for microphone, screen context, calendar, and local files.
- Start, pause, resume, and stop session controls.
- Overlay with compact and expanded modes.
- Hotkey configuration.
- Local diagnostic bundle export.
- Crash reporting.

Verification:

- Installers complete successfully on supported OS versions.
- App starts after reboot and update.
- Overlay remains responsive while transcription is active.
- Hotkeys work across Zoom, Meet, Teams, browser, and native apps.
- App handles missing permissions without crashing.
- Crash-free session rate exceeds release gate.

### 7.2 Audio and Realtime Transcription Platform

Scope:

- Microphone capture.
- System audio capture.
- Voice activity detection.
- Chunking.
- Streaming STT.
- Speaker source attribution.
- Transcript correction.

Deliverables:

- Audio device selector.
- Cloud STT integration.
- Optional local STT path.
- Transcript stream with partial and final segments.
- Device failure recovery.
- STT provider fallback interface.

Verification:

- Live transcript appears within 1 second of speech under normal conditions.
- Transcript segments include timestamps.
- Microphone and system audio can be captured separately where supported.
- Device disconnects produce recoverable error states.
- P95 STT partial latency meets target.

### 7.3 Context and Screen Understanding Platform

Scope:

- Active app detection.
- Window title detection.
- User-enabled screen capture.
- OCR and structured screen extraction.
- Browser extension context.
- Clipboard and selected-text context where authorized.
- Sensitive-data redaction.

Deliverables:

- Context permissions panel.
- Active window metadata collector.
- Screen text extraction service.
- Browser extension for page title, URL, selected text, and permitted page content.
- Redaction rules for secrets, payment data, and password-like fields.
- Context event log for debugging.

Verification:

- Screen context can be disabled at user and workspace levels.
- OCR extracts text from standard slides, docs, and browser pages with acceptable accuracy.
- Browser extension provides structured context without relying on screenshots.
- Redaction tests pass against known sensitive-pattern fixtures.

### 7.4 Knowledge and Memory Platform

Scope:

- Document upload.
- External source sync.
- Parsing.
- Chunking.
- Embeddings.
- Hybrid retrieval.
- Reranking.
- Permissions.
- Meeting memory.
- Team memory.

Deliverables:

- Knowledge base UI.
- Document ingestion pipeline.
- Connector ingestion jobs.
- Versioned document chunks.
- Vector and keyword search.
- Permission-aware retrieval.
- Meeting memory summaries.
- Team memory controls.

Verification:

- Uploaded PDF, DOCX, Markdown, HTML, and TXT documents are parsed and searchable.
- Retrieval excludes documents the user cannot access.
- Search result relevance passes benchmark thresholds.
- Source IDs are preserved from retrieval through generated answer.
- Deleted documents are removed from retrieval within the configured SLA.

### 7.5 AI Orchestration Platform

Scope:

- Prompt routing.
- Model provider abstraction.
- Live generation.
- Post-call generation.
- Structured output generation.
- Response validation.
- Prompt versioning.
- Evaluation harness.
- Cost controls.

Deliverables:

- Orchestrator service.
- Prompt registry.
- Model gateway.
- Streaming response API.
- JSON schema validation for structured outputs.
- Offline evaluation datasets.
- Model and prompt A/B testing.
- Token and cost telemetry.

Verification:

- Live suggestions stream to the client.
- Prompt versions are traceable for every suggestion.
- Structured outputs validate against schemas.
- Evaluation suite runs in CI or scheduled jobs.
- Cost dashboards show spend by workspace, feature, and model.

### 7.6 Workflow and Integrations Platform

Scope:

- Calendar.
- Email.
- CRM.
- ATS.
- Slack.
- Support ticketing.
- Webhooks.
- Workflow approvals.

Deliverables:

- Google Calendar integration.
- Microsoft Outlook integration.
- Gmail and Outlook draft support.
- Salesforce integration.
- HubSpot integration.
- Greenhouse or Ashby integration.
- Slack export.
- Zendesk or Linear ticket update support.
- Integration permission management.

Verification:

- Users can connect and revoke each integration.
- Pre-call briefs use calendar metadata.
- CRM update drafts are generated but require user approval before writeback.
- Integration failures are surfaced with actionable errors.
- Webhook deliveries are retried and auditable.

### 7.7 Admin, Governance, and Compliance Platform

Scope:

- Workspaces.
- Roles.
- Policies.
- Audit logs.
- Retention.
- Consent and disclosure configuration.
- Data export and deletion.
- SSO.
- SCIM.
- Data residency.

Deliverables:

- Admin console.
- Role-based access control.
- Workspace policy engine.
- Retention policy controls.
- Audit log viewer and export.
- SSO/SAML.
- SCIM provisioning.
- Subprocessor and data-flow documentation.
- Enterprise security pack.

Verification:

- Admin policy changes are enforced in desktop and web surfaces.
- Audit logs capture sensitive admin actions.
- Retention jobs delete records according to policy.
- SSO login succeeds with configured identity provider.
- SCIM provisioning creates, updates, and deactivates users.
- Security review checklist is complete.

### 7.8 Analytics, Coaching, and Quality Platform

Scope:

- User analytics.
- Team analytics.
- Meeting quality.
- Sales coaching.
- CS risk trends.
- Recruiting process metrics.
- AI quality metrics.

Deliverables:

- Usage dashboard.
- Meeting outcome dashboard.
- Suggestion acceptance dashboard.
- Latency and quality dashboard.
- Coaching insights.
- Risk and opportunity reports.
- Exportable analytics.

Verification:

- Analytics exclude sensitive content by default.
- Admins can view usage by team, feature, and time range.
- Latency metrics match backend traces.
- Coaching reports are tied to configured rubrics.
- Users can opt out of personal coaching analytics where policy requires.

### 7.9 Billing and Packaging Platform

Scope:

- Plan management.
- Seat management.
- Usage limits.
- Invoicing.
- Trials.
- Enterprise contracts.

Deliverables:

- Pricing tiers.
- Subscription checkout.
- Workspace seat management.
- Usage meters.
- Billing admin page.
- Enterprise manual billing support.

Verification:

- Plan limits are enforced.
- Usage meters reconcile with event logs.
- Subscription status changes update workspace entitlements.
- Billing events are auditable.

### 7.10 Security and Reliability Platform

Scope:

- Authentication.
- Authorization.
- Secrets management.
- Encryption.
- Observability.
- Incident response.
- Backups.
- Disaster recovery.
- Rate limiting.
- Abuse monitoring.

Deliverables:

- Central auth service.
- Resource authorization layer.
- Encrypted storage.
- Secrets rotation process.
- OpenTelemetry tracing.
- Sentry or equivalent crash reporting.
- Backup and restore process.
- Runbooks.
- Status page.

Verification:

- Authz tests cover workspace isolation.
- Backup restore drill succeeds.
- Incident runbooks exist for provider outage, data exposure, and production degradation.
- P95 and P99 latency dashboards exist for critical paths.
- Alerts fire on defined SLO violations.

## 8. Release Milestones

The milestones below describe a full system path. Each milestone should end with a demonstrable release, objective quality gates, and a decision about whether to proceed.

The production vertical roadmap in `docs/development/plans/2026-06-25-production-vertical-roadmap.md` is the implementation-order source of truth for a small team proving one commercially useful vertical. This full-system scope remains the product-completeness target. When the two appear to differ, treat this document as describing final milestone capability and the production vertical roadmap as the narrower build sequence used to reduce scope risk.

### Milestone 0: Product and Architecture Foundation

Objective: Make the system buildable by locking the initial architecture, operating model, and quality targets.

Deliverables:

- Product requirements baseline.
- Technical architecture decision records.
- C4 architecture diagrams.
- Code architecture and repository layout.
- Desktop shell ADR.
- Infrastructure and DevOps architecture.
- CI/CD and release strategy.
- Testing strategy.
- Agent development workflow and project-local skills.
- Realtime session protocol baseline.
- Failure mode and recovery matrix.
- Multi-tenancy and workspace isolation model.
- Data-flow and trust-boundary documentation.
- Threat model.
- SRS-to-scope traceability matrix.
- Data model draft.
- Initial provider selection for STT, LLM, embeddings, storage, auth, and billing.
- UX flows for onboarding, live session, knowledge base, and post-call review.
- Initial evaluation plan.

Verification:

- Architecture review completed.
- Threat model reviewed.
- Realtime protocol reviewed by desktop and backend owners.
- Multi-tenancy model reviewed by backend and security owners.
- Data-flow documentation reviewed for enterprise security readiness.
- Traceability matrix reviewed for milestone coverage.
- Infrastructure and CI/CD strategy reviewed by engineering owner.
- Testing strategy reviewed by engineering and QA owners.
- Desktop shell ADR spike criteria accepted or assigned.
- Provider decisions documented.
- End-to-end user journeys approved.
- Initial backlog mapped to product and platform verticals.

Exit gate:

- Engineering can begin implementation without unresolved architecture blockers.

### Milestone 1: Core Desktop and Realtime Backbone

Objective: Establish a working desktop client with authorized audio capture, live transcript, and realtime backend transport.

Deliverables:

- Windows and macOS app shell.
- User auth.
- Workspace selection.
- Microphone capture.
- System audio capture where supported.
- Realtime session service.
- Streaming STT integration.
- Live transcript panel.
- Start, pause, resume, and stop controls.
- Basic diagnostic logging.

Verification:

- User can install, sign in, and start a session on Windows and macOS.
- Speech appears in the transcript during a live call.
- Audio device changes do not crash the app.
- Backend receives session events with timestamps.
- P95 transcript partial latency is below target.

Exit gate:

- Internal team can use Dokeza for real meetings and produce transcripts reliably.

### Milestone 2: Live AI Assistance

Objective: Convert live transcript and context into useful, low-latency suggestions.

Deliverables:

- Context manager.
- Manual "suggest answer" command.
- Live suggestion overlay.
- LLM orchestrator.
- Prompt registry.
- Streaming generation.
- Basic source-free meeting assistance.
- Suggestion feedback controls.
- Latency and cost telemetry.

Verification:

- Hotkey-triggered suggestions appear in the overlay.
- First useful suggestion P95 is under 3 seconds under normal network conditions.
- Suggestions are short enough to read during a live call.
- Each suggestion is traceable to model, prompt version, and session context.
- Suggestion feedback is stored for evaluation.

Exit gate:

- Internal users choose to keep the overlay open during real meetings because it is useful rather than distracting.

### Milestone 3: Knowledge Base and Source-Grounded Answers

Objective: Make Dokeza meaningfully better than generic chat by grounding answers in trusted knowledge.

Deliverables:

- Knowledge base UI.
- Document upload.
- Document parser.
- Chunking and embeddings.
- Hybrid retrieval.
- Reranking.
- Source-grounded answer generation.
- Permission-aware retrieval.
- Knowledge ingestion status.
- Retrieval evaluation dataset.

Verification:

- Dokeza answers factual questions from uploaded documents.
- Generated answers include source metadata.
- Retrieval excludes unauthorized documents.
- Retrieval benchmark meets defined relevance threshold.
- Deleted or disabled documents no longer appear in retrieval.

Exit gate:

- Sales, support, and CS users can trust Dokeza for company-specific answers during calls.

### Milestone 4: Pre-Call and Post-Call Workflow

Objective: Expand Dokeza across the full meeting lifecycle.

Deliverables:

- Google Calendar integration.
- Microsoft Outlook integration.
- Pre-call brief generation.
- Meeting summary generation.
- Action item extraction.
- Follow-up email drafts.
- Editable post-call review page.
- Export to Markdown, PDF, clipboard, and email draft.

Verification:

- Calendar events produce useful pre-call briefs.
- Completed meetings produce summaries and action items.
- Follow-up drafts use meeting context and user tone settings.
- Users can edit all generated outputs before sharing.
- Generated action items include owner and due-date candidates where available.

Exit gate:

- Users can complete a real call workflow from pre-call prep to follow-up without leaving Dokeza except for final send or approval.

### Milestone 5: Role-Specific Product Verticals

Objective: Turn the generic copilot into differentiated workflows for target segments.

Deliverables:

- Sales workspace mode.
- Customer success workspace mode.
- Recruiting workspace mode.
- Consulting workspace mode.
- Support and solutions workspace mode.
- Internal meetings workspace mode.
- Role-specific prompt packs.
- Role-specific post-call templates.
- Role-specific evaluation datasets.

Verification:

- Each vertical has at least one complete pre-call, live-call, and post-call workflow.
- Role-specific suggestions outperform generic suggestions in evaluation.
- Users can configure default meeting type and templates.
- Vertical outputs map to relevant downstream systems.

Exit gate:

- At least two verticals are strong enough for design partners or paid pilots.

### Milestone 6: Integrations and System of Record Writeback

Objective: Make Dokeza operational by pushing approved outputs into customer systems.

Deliverables:

- Salesforce integration.
- HubSpot integration.
- Slack integration.
- Gmail and Outlook draft support.
- ATS integration.
- Support ticketing integration.
- Webhook framework.
- Approval workflow for writeback.
- Integration audit logs.

Verification:

- Users can connect and revoke integrations.
- Dokeza can draft CRM updates from meeting notes.
- Writeback requires user approval unless explicitly configured otherwise.
- Integration errors are recoverable and visible.
- Audit logs show who approved each writeback.

Exit gate:

- Dokeza becomes part of daily workflow instead of a separate notes app.

### Milestone 7: Enterprise Governance

Objective: Make Dokeza acceptable for larger teams and security-conscious customers.

Deliverables:

- Admin console.
- Role-based access control.
- Workspace policies.
- Retention controls.
- Audit log export.
- SSO/SAML.
- SCIM provisioning.
- Data export and deletion tools.
- Security documentation.
- Subprocessor list.
- Data flow diagrams.

Verification:

- Admins can enforce capture and retention policies.
- SSO and SCIM work with a test identity provider.
- Audit logs cover admin and integration-sensitive actions.
- Deletion and retention jobs pass compliance test cases.
- Security review package is complete.

Exit gate:

- Dokeza can pass a reasonable enterprise security review.

### Milestone 8: Analytics, Coaching, and Team Intelligence

Objective: Turn meeting data into team-level learning and measurable improvement.

Deliverables:

- Usage analytics.
- Meeting quality dashboard.
- Sales coaching dashboard.
- CS risk dashboard.
- Recruiting process dashboard.
- Suggestion quality dashboard.
- Team memory insights.
- Configurable rubrics.

Verification:

- Analytics can be filtered by team, role, meeting type, and date range.
- Sensitive content is excluded from aggregate analytics by default.
- Coaching insights map to configured rubrics.
- Suggestion quality metrics are linked to feedback and outcomes.
- Admins can export analytics.

Exit gate:

- Managers can use Dokeza to improve team performance without reading every transcript.

### Milestone 9: Local-First and Advanced Privacy

Objective: Support privacy-sensitive customers and reduce dependency on cloud processing.

Deliverables:

- Local STT option.
- Local embeddings option.
- Local redaction before cloud calls.
- Workspace-level model provider controls.
- No-storage live mode.
- Region-aware storage controls.
- Privacy-preserving diagnostics.

Verification:

- Local STT produces usable transcripts on supported hardware.
- Redaction runs before cloud provider calls where configured.
- No-storage mode leaves no cloud transcript after session completion.
- Provider selection is enforced per workspace policy.
- Diagnostics exclude sensitive content.

Exit gate:

- Dokeza can serve customers with strict privacy constraints.

### Milestone 10: Scale, Reliability, and Commercial Readiness

Objective: Harden Dokeza for broad production use.

Deliverables:

- Billing and packaging.
- Seat management.
- Usage metering.
- Rate limiting.
- Abuse monitoring.
- Disaster recovery.
- Backup restore drills.
- SLO dashboards.
- Status page.
- Production incident runbooks.

Verification:

- Plan limits are enforced.
- Usage meters reconcile with billing events.
- Backup restoration succeeds in drill.
- Alerts fire for SLO violations.
- Load tests meet target concurrent session capacity.
- Incident runbooks are exercised.

Exit gate:

- Dokeza is ready for paid self-serve teams and enterprise pilots at production reliability.

## 9. Cross-Milestone Deliverable Matrix

| Vertical | First Meaningful Delivery | Full Delivery |
| --- | --- | --- |
| Desktop Client | Milestone 1 | Milestone 10 |
| Realtime Transcription | Milestone 1 | Milestone 9 |
| Live AI Suggestions | Milestone 2 | Milestone 8 |
| Knowledge Base | Milestone 3 | Milestone 9 |
| Pre/Post Call Workflow | Milestone 4 | Milestone 8 |
| Sales | Milestone 5 | Milestone 8 |
| Customer Success | Milestone 5 | Milestone 8 |
| Recruiting | Milestone 5 | Milestone 8 |
| Consulting | Milestone 5 | Milestone 8 |
| Support and Solutions | Milestone 5 | Milestone 8 |
| Integrations | Milestone 4 | Milestone 6 |
| Admin and Governance | Milestone 3 | Milestone 7 |
| Analytics and Coaching | Milestone 8 | Milestone 10 |
| Billing | Milestone 10 | Milestone 10 |
| Local-First Privacy | Milestone 9 | Milestone 10 |

## 10. Verifiable System-Level Requirements

### 10.1 Performance Requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| PERF-001 | P95 first useful live suggestion shall be under 3 seconds. | End-to-end latency trace from speech event to overlay render. |
| PERF-002 | P95 STT partial transcript latency shall be under 1 second. | STT telemetry on live test sessions. |
| PERF-003 | Overlay render updates shall complete under 100 ms after data receipt. | Desktop performance instrumentation. |
| PERF-004 | Knowledge retrieval shall complete under 500 ms P95 for typical workspaces. | Retrieval service traces. |
| PERF-005 | Post-call summary for a 60-minute meeting shall complete under 2 minutes. | Post-call workflow telemetry. |

### 10.1.1 Cost and Usage Requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| COST-001 | AI, STT, embedding, and reranking provider usage shall be attributable by workspace, session, provider route, and feature. | Usage ledger and telemetry reconciliation. |
| COST-002 | Live suggestion requests shall enforce token budgets for transcript context, retrieved sources, system instructions, and generated output. | Prompt assembly tests and usage telemetry. |
| COST-003 | Automatic LLM-triggered requests shall be debounced to no more than six requests per minute per active meeting session unless workspace policy sets a stricter limit. | Rate-limit and debounce tests. |
| COST-004 | Individual-plan normal usage should target provider cost below the configured commercial threshold, initially $0.15 for a 60-minute meeting until production pricing data replaces the planning assumption. | Cost model review against provider usage traces. |

### 10.2 Quality Requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| QUAL-001 | Source-grounded answer hallucination rate shall remain below the defined threshold on evaluation sets. | Offline eval dataset and human review. |
| QUAL-002 | Retrieval top-5 relevance shall meet benchmark threshold per vertical. | Retrieval evaluation. |
| QUAL-003 | Action item extraction shall identify owner and due date candidates when present. | Labeled transcript tests. |
| QUAL-004 | Live suggestions shall pass role-specific usefulness review. | Human scoring by target users. |
| QUAL-005 | Post-call summaries shall preserve key decisions and commitments. | Labeled meeting evaluation. |

### 10.3 Reliability Requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| REL-001 | Desktop crash-free meeting sessions shall exceed 99.5% before commercial launch. | Crash reporting. |
| REL-002 | Backend realtime services shall meet 99.9% monthly availability before enterprise launch. | SLO dashboard. |
| REL-003 | Temporary STT provider failure shall produce graceful degradation. | Provider failure test. |
| REL-004 | Audio device disconnect shall not crash the desktop app. | Desktop QA test suite. |
| REL-005 | Post-call jobs shall retry and surface failure states. | Workflow tests. |

### 10.4 Security and Governance Requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| SEC-001 | All meeting content shall be encrypted in transit and at rest. | Security review and infrastructure configuration. |
| SEC-002 | Authorization shall be enforced on all workspace resources. | Automated authz tests. |
| SEC-003 | Admin actions shall be auditable. | Audit log tests. |
| SEC-004 | Retention policies shall be enforced automatically. | Retention job tests. |
| SEC-005 | Customer data shall not be used for model training unless explicitly contracted and enabled. | Policy, provider settings, and contract review. |

## 11. Team and Ownership Model

### 11.1 Product Squads

| Squad | Owns |
| --- | --- |
| Desktop Experience | Desktop app, overlay, capture UX, permissions, local cache, updates. |
| Realtime Platform | Audio pipeline, STT, session transport, latency, live transcript. |
| AI Platform | Prompt registry, LLM orchestration, evaluation, response validation, model gateway. |
| Knowledge Platform | Ingestion, parsing, embeddings, retrieval, permissions, memory. |
| Workflow Integrations | Calendar, email, CRM, ATS, Slack, support systems, writeback. |
| Admin and Enterprise | RBAC, policies, audit logs, SSO, SCIM, retention, compliance. |
| Analytics and Coaching | Dashboards, metrics, rubrics, quality insights, team intelligence. |
| Infrastructure and Security | Cloud platform, observability, reliability, secrets, incident response, billing infrastructure. |

### 11.2 Engineering Roles

For full-system delivery, the expected team shape is:

- Desktop engineers.
- Backend engineers.
- Realtime/audio engineers.
- AI engineers.
- Data/retrieval engineers.
- Security engineer.
- Infrastructure engineer.
- Product designer.
- QA automation engineer.
- Product manager.
- Technical writer or developer advocate for enterprise docs.

## 12. Testing Strategy

### 12.1 Automated Testing

- Unit tests for capture adapters, context manager, prompt assembly, retrieval filters, and output parsers.
- Integration tests for STT, LLM provider adapters, document ingestion, and integrations.
- End-to-end tests for onboarding, live session, knowledge answer, post-call review, and writeback.
- Authorization tests for cross-workspace isolation.
- Regression tests for prompt templates and structured outputs.

### 12.2 Manual and Exploratory Testing

- Cross-platform desktop QA on supported Windows and macOS versions.
- Meeting platform compatibility tests for Zoom, Meet, Teams, Slack, and browser calls.
- Audio device tests with built-in microphones, Bluetooth devices, USB devices, and monitor audio.
- UX tests for distraction, readability, and meeting flow.
- Vertical-specific user testing with sales, CS, recruiting, consulting, and support users.

### 12.3 AI Evaluation

- Labeled transcript test sets.
- Retrieval relevance benchmarks.
- Source-grounded Q&A tests.
- Prompt regression tests.
- Hallucination audits.
- Human usefulness scoring.
- Latency and cost evaluation per model route.

## 13. Operational Requirements

### 13.1 Observability

Dokeza shall provide:

- Distributed traces for live suggestion path.
- STT latency and error metrics.
- Retrieval latency and relevance metrics.
- LLM latency, token, and cost metrics.
- Desktop crash and performance telemetry.
- Integration success and failure metrics.
- Retention and deletion job metrics.

### 13.2 Incident Response

Dokeza shall maintain runbooks for:

- STT provider outage.
- LLM provider outage.
- Realtime service degradation.
- Data access incident.
- Integration provider outage.
- Desktop auto-update rollback.
- Billing provider outage.

### 13.3 Documentation

Dokeza shall maintain:

- User onboarding docs.
- Admin setup docs.
- Integration setup docs.
- Security and privacy whitepaper.
- Data flow diagrams.
- Subprocessor list.
- API and webhook docs.
- Troubleshooting guides.

## 14. Packaging and Commercial Readiness

### 14.1 Suggested Plans

| Plan | Target | Core Capabilities |
| --- | --- | --- |
| Individual | Solo professionals | Desktop copilot, live suggestions, notes, limited knowledge. |
| Team | Small teams | Shared workspace, team knowledge, calendar, post-call workflow. |
| Business | Revenue and operations teams | CRM, analytics, role templates, admin controls. |
| Enterprise | Larger organizations | SSO, SCIM, retention, audit logs, data controls, custom security review. |

### 14.2 Commercial Gates

Dokeza should not launch paid team plans until:

- Billing and usage metering are accurate.
- Data deletion and retention controls are functional.
- Workspace permissions are enforced.
- Customer support diagnostics are safe and useful.
- Core workflows have measured reliability.

Dokeza should not launch enterprise plans until:

- SSO and SCIM are functional.
- Audit logs and retention policies are verified.
- Security documentation is complete.
- A backup and restore drill has succeeded.
- Enterprise support process exists.

## 15. Risk Register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Live latency is too high | High | Optimize STT streaming, retrieval, and model routing. Maintain latency traces per stage. |
| Suggestions are too generic | High | Invest in source grounding, vertical templates, CRM context, and evaluation. |
| macOS audio capture is unreliable | High | Use supported APIs, clear onboarding, diagnostics, and fallbacks. |
| Privacy concerns block adoption | High | Strong controls, transparent docs, local-first options, and enterprise governance. |
| Integrations take longer than expected | Medium | Prioritize calendar, email, Salesforce, and HubSpot first. Use connector abstractions. |
| AI costs hurt margins | Medium | Debounce calls, use model routing, cache retrieval, summarize context, monitor cost per meeting. |
| Overlay becomes distracting | Medium | Offer compact mode, manual mode, ranking, suppression, and UX testing. |
| Enterprise review slows sales | Medium | Build security pack, audit logs, retention, SSO, and clear subprocessor docs early. |
| Retrieval exposes unauthorized content | High | Permission-aware retrieval, authz tests, and source-access validation before generation. |

## 16. Definition of Done

A Dokeza feature is done only when:

- User-facing behavior is implemented.
- Backend and desktop telemetry are present.
- Error states are handled.
- Permissions and policy behavior are defined.
- Automated tests cover critical paths.
- AI features have evaluation coverage where applicable.
- Documentation is updated.
- Architecture, protocol, security, or traceability docs are updated when the feature changes system boundaries or contracts.
- Security and privacy implications are reviewed.
- Acceptance criteria are verified in a realistic workflow.

## 17. Open Decisions

Initial implementation decisions for backend runtime, data store, vector store, workflow queue, realtime audio routing/framing, AI providers, retention defaults, and the Windows Tauri v2 spike result are resolved in the architecture ADRs and spike evidence. The remaining decisions below are product, commercial, legal, or enterprise-launch decisions.

- Which vertical should be the first commercial wedge: sales, CS, recruiting, consulting, or support?
- Which CRM should be first: Salesforce or HubSpot?
- Which ATS should be first for recruiting workflows?
- What regions must be supported for first enterprise customers?
- What disclosure and consent UX should be configurable by admins?

Resolved decisions:

- The Tauri v2 implementation spike passed the accepted ADR criteria on Windows, with macOS validation pending before cross-platform beta. See `docs/development/tauri_capability_spike_results.md`.
- Local STT remains supported by architecture boundaries but is not prioritized before the initial commercial vertical. ADR-0005 sets cloud-first STT and LLM defaults; local-first capabilities remain part of Milestone 9.
