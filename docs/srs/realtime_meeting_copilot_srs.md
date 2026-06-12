# Software Requirements Specification: Real-Time Meeting Copilot

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) defines the requirements for a real-time desktop meeting copilot that assists users during live calls, sales conversations, recruiting screens, customer success meetings, consulting sessions, and internal meetings.

The system will capture authorized meeting context, transcribe speech in real time, retrieve relevant organizational knowledge, and present concise, actionable suggestions through a desktop overlay or companion panel. It will also generate post-meeting summaries, action items, follow-up drafts, and structured updates for downstream systems.

### 1.2 Product Vision

The product should outperform existing real-time AI meeting assistants by focusing on:

- Low-latency transcription and response generation.
- High-quality context retrieval from company knowledge, prior meetings, CRM records, and calendar data.
- Concise, speakable, source-grounded suggestions.
- Strong privacy, security, consent, and administrative controls.
- Reliable cross-platform desktop behavior.
- Workflow automation that saves meaningful time after calls.

The product is not intended to bypass proctoring, meeting transparency, access controls, or platform detection systems. Any display privacy features must be framed as preventing accidental exposure of private notes or sensitive internal material, not as evasion.

### 1.3 Intended Audience

This document is intended for:

- Product managers.
- Engineering leads.
- Desktop application engineers.
- AI/ML engineers.
- Backend engineers.
- Security and compliance reviewers.
- QA engineers.
- UX designers.
- Go-to-market and customer success teams.

### 1.4 Scope

The first major release will support:

- Desktop application shell for macOS and Windows.
- User-authenticated workspaces.
- Microphone and system audio capture with explicit user permission.
- Real-time speech-to-text.
- Rolling transcript state.
- Live suggestion generation.
- Manual and automatic suggestion triggers.
- Document upload and knowledge-base retrieval.
- Calendar integration.
- Post-call notes and follow-up generation.
- Basic admin and privacy controls.

Later releases may add:

- CRM integrations.
- ATS integrations.
- Browser extension context.
- Team analytics.
- Coaching workflows.
- Local-first inference options.
- Advanced role-specific playbooks.

### 1.4.1 Related Engineering Specifications

This SRS is supported by the following execution-level documents:

- `docs/architecture/c4_architecture.md`
- `docs/architecture/code_architecture.md`
- `docs/architecture/adr/0001-desktop-shell-tauri-v2.md`
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

### 1.5 Definitions

| Term | Definition |
| --- | --- |
| Copilot | The AI assistant that provides real-time and post-call support. |
| Overlay | A floating desktop UI that displays suggestions or notes above other windows. |
| STT | Speech-to-text transcription. |
| VAD | Voice activity detection. |
| RAG | Retrieval-augmented generation, where relevant source material is retrieved before LLM generation. |
| Knowledge Base | Uploaded or synced organizational content used to answer questions. |
| Workspace | A team or organization account containing users, documents, meetings, settings, and policies. |
| Meeting Session | A time-bound live interaction tracked by the application. |
| Suggestion | A generated answer, follow-up question, objection response, clarification, or next-step recommendation. |
| Source-Grounded Answer | An answer linked to retrieved documents, CRM records, prior notes, or other trusted context. |

## 2. Overall Description

### 2.1 Product Perspective

The product is a desktop-first application backed by cloud services for identity, synchronization, knowledge storage, retrieval, LLM orchestration, and integrations.

The system has seven major subsystems:

1. Desktop application shell.
2. Audio capture and processing pipeline.
3. Speech-to-text service.
4. Context manager.
5. Knowledge retrieval system.
6. LLM orchestration layer.
7. Post-call processing and integrations.

### 2.2 Product Functions

At a high level, the system shall:

- Capture authorized audio from live meetings.
- Convert live audio into a rolling transcript.
- Detect questions, objections, follow-up opportunities, and action items.
- Retrieve relevant knowledge from uploaded documents and connected systems.
- Generate concise real-time suggestions.
- Display suggestions in a non-disruptive desktop UI.
- Produce structured post-call artifacts.
- Respect workspace policies, retention settings, and consent requirements.

### 2.3 User Classes

| User Class | Description | Primary Needs |
| --- | --- | --- |
| Individual User | A single professional using the copilot for meetings. | Fast setup, reliable suggestions, useful notes. |
| Sales Representative | Uses the copilot during prospect and customer calls. | Objection handling, pricing answers, follow-up drafts, CRM updates. |
| Customer Success Manager | Uses the copilot for customer check-ins and escalations. | Account history, action items, risk signals. |
| Recruiter | Uses the copilot for candidate screens. | Candidate context, follow-up questions, structured notes. |
| Consultant | Uses the copilot across client meetings. | Client-specific context, summaries, deliverables. |
| Team Admin | Manages workspace settings, members, policies, and integrations. | Controls, auditability, compliance, usage visibility. |
| Security Reviewer | Evaluates privacy and compliance posture. | Data flow clarity, retention controls, access controls, audit logs. |

### 2.4 Operating Environment

The desktop application should support:

- Windows 10 version 2004 or later.
- Windows 11.
- macOS 13 or later.

The backend should support:

- Public cloud deployment.
- Region-aware storage where commercially required.
- Enterprise SSO in later releases.

Supported meeting environments should include:

- Zoom.
- Google Meet.
- Microsoft Teams.
- Slack huddles.
- Browser-based meeting tools.
- General microphone/system audio contexts.

### 2.5 Design and Implementation Constraints

- The desktop client must request explicit OS permissions for microphone, screen, calendar, and file access.
- The product must not require users to bypass OS security protections.
- System audio capture must comply with platform permission models.
- Sensitive meeting data must be encrypted in transit and at rest.
- The system must support configurable data retention.
- The overlay must be usable without interfering with meeting participation.
- Real-time suggestions must favor short, speakable responses over long generated prose.
- The first release should avoid training proprietary models and instead orchestrate hosted or local models.

### 2.6 Assumptions and Dependencies

- Users have permission to use an AI assistant in their meeting context.
- Meeting participants have been notified where required by law, company policy, or platform rules.
- Cloud LLM and STT providers meet required availability and privacy standards.
- macOS system audio capture may require ScreenCaptureKit-based capture or approved virtual audio routing.
- Enterprise customers may require custom retention, deployment, and audit features before adoption.

## 3. System Architecture Requirements

### 3.1 Reference Architecture

```text
-----------------------+
| Desktop Client       |
| - Overlay UI         |
| - Settings           |
| - Hotkeys            |
| - Local Cache        |
+----------+------------+
           |
           v
+-----------------------+
| Capture Layer         |
| - Microphone Audio    |
| - System Audio        |
| - Screen Context      |
| - Active Window       |
+----------+------------+
           |
           v
+-----------------------+
| Realtime Pipeline     |
| - VAD                 |
| - Chunking            |
| - STT                 |
| - Speaker Attribution |
+----------+------------+
           |
           v
+-----------------------+
| Context Manager       |
| - Rolling Transcript  |
| - Meeting State       |
| - User Profile        |
| - Retrieved Sources   |
+----------+------------+
           |
           v
+-----------------------+
| LLM Orchestrator      |
| - Routing             |
| - Prompt Assembly     |
| - Generation          |
| - Response Validation |
+----------+------------+
           |
           v
+-----------------------+
| Output Layer          |
| - Live Suggestions    |
| - Notes               |
| - Action Items        |
| - Follow-up Drafts    |
+-----------------------+
```

### 3.2 Recommended Technology Stack

| Layer | Preferred Option | Alternative |
| --- | --- | --- |
| Desktop Shell | Tauri v2 | Electron |
| Desktop Backend | Rust | Node.js native modules |
| UI | React + TypeScript | Svelte |
| Local Storage | SQLite | IndexedDB |
| Backend API | TypeScript/Node or Go | Python/FastAPI |
| Primary Database | PostgreSQL | Cloud SQL equivalent |
| Vector Search | pgvector or Qdrant | Pinecone, Weaviate |
| Queue/Workflow | Temporal, BullMQ, or Cloud Tasks | SQS-style queue |
| Realtime Transport | WebSocket | WebRTC data channels |
| STT | Deepgram/AssemblyAI streaming | whisper.cpp local |
| LLM | Fast hosted model for live, stronger model for post-call | Local model for privacy mode |
| Observability | OpenTelemetry + Sentry | Datadog |

### 3.4 Processing Location Model

Every major AI pipeline stage should declare where it executes:

| Stage | Supported Locations |
| --- | --- |
| STT | `cloud`, `local`, `hybrid` |
| Embeddings | `cloud`, `local`, `hybrid` |
| Retrieval | `cloud`, `local`, `hybrid` |
| LLM generation | `cloud`, `local`, `hybrid` |

The initial implementation may use cloud-first processing, but internal interfaces must not assume that all stages are permanently cloud-only.

### 3.3 Latency Budget

The live assistance path should target the following budget:

| Stage | Target |
| --- | ---: |
| Audio capture and buffering | 100-300 ms |
| VAD and chunking | 50-150 ms |
| Streaming STT partial result | 300-800 ms |
| Event detection | 50-200 ms |
| Retrieval | 100-500 ms |
| LLM first token | 300-1000 ms |
| Overlay render | <100 ms |
| End-to-end first useful suggestion | 1.0-3.0 seconds |

## 4. Functional Requirements

### 4.1 Desktop Application Shell

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-001 | The system shall provide a desktop application for Windows and macOS. | Must |
| FR-002 | The system shall provide a main application window for onboarding, settings, integrations, billing, and meeting history. | Must |
| FR-003 | The system shall provide a compact overlay or side panel for live suggestions. | Must |
| FR-004 | The system shall support global hotkeys for opening the assistant, requesting suggestions, dismissing suggestions, and muting capture. | Must |
| FR-005 | The system shall allow users to customize hotkeys. | Should |
| FR-006 | The system shall run audio and transcription tasks outside the UI thread. | Must |
| FR-007 | The system shall support automatic updates. | Should |
| FR-008 | The system shall provide local diagnostic logs that exclude sensitive transcript content by default. | Must |
| FR-009 | The system shall not apply desktop updates during an active meeting session. | Must |
| FR-010 | The system shall support rollback to the previous desktop version after a failed or unstable update. | Should |
| FR-011 | The system shall support stable and beta update channels. | Should |

### 4.2 Onboarding and Permissions

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-020 | The system shall guide users through account creation and workspace selection. | Must |
| FR-021 | The system shall request microphone permissions before audio capture. | Must |
| FR-022 | The system shall request screen capture permissions only when screen context features are enabled. | Must |
| FR-023 | The system shall explain what data is captured and how it is used before enabling capture. | Must |
| FR-024 | The system shall let users disable microphone, system audio, screen context, and document retrieval independently. | Must |
| FR-025 | The system shall provide a visible capture state indicator in the desktop client. | Must |

### 4.3 Audio Capture

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-040 | The system shall capture microphone audio with user permission. | Must |
| FR-041 | The system shall capture system audio where supported and authorized by the operating system. | Must |
| FR-042 | The system shall distinguish user microphone audio from remote participant/system audio where feasible. | Should |
| FR-043 | The system shall support device selection for microphone and output audio. | Must |
| FR-044 | The system shall detect silence using VAD to reduce unnecessary processing. | Must |
| FR-045 | The system shall buffer audio into chunks suitable for streaming STT. | Must |
| FR-046 | The system shall tolerate audio device changes during a meeting. | Should |
| FR-047 | The system shall provide clear error states for missing permissions, unavailable loopback audio, and disconnected devices. | Must |

### 4.4 Speech-to-Text

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-060 | The system shall transcribe meeting audio in real time. | Must |
| FR-061 | The system shall stream partial transcript results to the context manager. | Must |
| FR-062 | The system shall revise partial transcript segments when final STT results arrive. | Must |
| FR-063 | The system shall store transcript segments with timestamps. | Must |
| FR-064 | The system shall tag transcript segments by speaker source where feasible. | Should |
| FR-065 | The system shall support a cloud STT provider for low-latency transcription. | Must |
| FR-066 | The system should support local STT for privacy-sensitive users. | Should |
| FR-067 | The system shall continue the meeting session gracefully if STT temporarily fails. | Must |

### 4.5 Screen and Application Context

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-080 | The system shall detect the active application and window title with user permission where required. | Should |
| FR-081 | The system shall support user-enabled screen capture for extracting contextual text. | Should |
| FR-082 | The system shall extract visible text using OCR or vision-based parsing. | Should |
| FR-083 | The system shall avoid continuous high-frequency screen capture by default. | Must |
| FR-084 | The system shall allow users to disable screen context entirely. | Must |
| FR-085 | The system shall redact sensitive fields where supported, including passwords, payment fields, and known secret patterns. | Should |
| FR-086 | The system shall prefer structured integrations or browser extension context over OCR when available and authorized. | Should |
| FR-087 | The system shall allow users and admins to revoke browser extension access. | Should |

### 4.6 Meeting Session Management

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-100 | The system shall allow users to manually start and stop a meeting session. | Must |
| FR-101 | The system should detect likely meeting activity and offer to start a session. | Should |
| FR-102 | The system shall maintain a rolling meeting state containing transcript, detected topics, open questions, decisions, and action items. | Must |
| FR-103 | The system shall summarize older meeting context to control prompt size. | Must |
| FR-104 | The system shall persist meeting records according to workspace retention settings. | Must |
| FR-105 | The system shall let users delete local and cloud meeting records where policy allows. | Must |

### 4.7 Knowledge Base

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-120 | The system shall allow users to upload documents for assistant context. | Must |
| FR-121 | The system shall parse common document formats, including PDF, DOCX, TXT, Markdown, and HTML. | Must |
| FR-122 | The system shall chunk uploaded documents for retrieval. | Must |
| FR-123 | The system shall create embeddings for searchable knowledge content. | Must |
| FR-124 | The system shall support document-level permissions. | Should |
| FR-125 | The system shall track source metadata for retrieved chunks. | Must |
| FR-126 | The system shall allow admins to remove or disable documents. | Must |
| FR-127 | The system should support syncing knowledge from external systems such as Notion, Google Drive, Confluence, or help centers. | Should |

### 4.8 Retrieval and Context Assembly

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-140 | The system shall retrieve relevant knowledge based on live transcript events and manual user requests. | Must |
| FR-141 | The system shall combine vector retrieval and keyword search where feasible. | Should |
| FR-142 | The system shall rerank retrieved results before passing them to the LLM. | Should |
| FR-143 | The system shall include source metadata in generated answers when source material is used. | Must |
| FR-144 | The system shall exclude content the user is not authorized to access. | Must |
| FR-145 | The system shall support role-specific prompt context, such as sales, recruiting, support, or consulting. | Should |
| FR-146 | The system shall avoid sending unnecessary sensitive context to external services. | Must |

### 4.9 LLM Orchestration

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-160 | The system shall route tasks to specialized prompt templates or model calls. | Must |
| FR-161 | The system shall support live answer generation for detected questions. | Must |
| FR-162 | The system shall support objection-handling suggestions. | Should |
| FR-163 | The system shall support follow-up question suggestions. | Must |
| FR-164 | The system shall support concise meeting summarization during and after calls. | Must |
| FR-165 | The system shall stream live generation results to the desktop client. | Must |
| FR-166 | The system shall validate generated responses for format, length, and source availability. | Should |
| FR-167 | The system shall prefer short, speakable responses for live suggestions. | Must |
| FR-168 | The system shall support user and workspace custom instructions. | Should |
| FR-169 | The system shall debounce automatic LLM calls to control cost and reduce suggestion noise. | Must |

### 4.10 Live Suggestion Engine

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-180 | The system shall detect explicit questions from other speakers. | Must |
| FR-181 | The system shall detect common sales or support objections where role context is configured. | Should |
| FR-182 | The system shall detect moments where a follow-up question may be useful. | Should |
| FR-183 | The system shall allow users to manually request "suggest answer", "summarize so far", and "suggest follow-up questions". | Must |
| FR-184 | The system shall rank suggestions by relevance and urgency. | Should |
| FR-185 | The system shall suppress repetitive or low-confidence suggestions. | Must |
| FR-186 | The system shall show confidence or source cues when appropriate. | Should |

### 4.11 Overlay and Live UI

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-200 | The system shall display live suggestions in a compact overlay or side panel. | Must |
| FR-201 | The overlay shall be movable and resizable. | Must |
| FR-202 | The overlay shall support compact and expanded display modes. | Should |
| FR-203 | The overlay shall support dismiss, copy, pin, and request-more actions. | Must |
| FR-204 | The overlay shall avoid covering critical meeting controls by default where detectable. | Should |
| FR-205 | The overlay shall provide clear capture and assistant status indicators. | Must |
| FR-206 | The overlay shall avoid displaying long responses that cannot be read quickly during a call. | Must |
| FR-207 | The overlay shall provide privacy controls to prevent accidental exposure of sensitive assistant content during user-controlled presentation modes where supported by OS and platform policy. | Should |
| FR-208 | The overlay shall not be marketed or designed as a mechanism for bypassing proctoring, disclosure, monitoring, or platform policy. | Must |

### 4.12 Post-Call Processing

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-220 | The system shall generate a meeting summary after a session ends. | Must |
| FR-221 | The system shall extract action items with owner and due-date candidates where available. | Must |
| FR-222 | The system shall generate a follow-up email draft. | Must |
| FR-223 | The system shall identify open questions and unresolved risks. | Should |
| FR-224 | The system shall allow users to edit generated notes before sharing or exporting. | Must |
| FR-225 | The system shall export notes to Markdown, PDF, or clipboard. | Should |
| FR-226 | The system should sync structured outputs to CRM or other connected systems. | Should |

### 4.13 Integrations

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-240 | The system shall support Google Calendar integration. | Must |
| FR-241 | The system shall support Microsoft Outlook Calendar integration. | Should |
| FR-242 | The system shall use calendar events to generate pre-call briefs. | Should |
| FR-243 | The system should support HubSpot integration. | Should |
| FR-244 | The system should support Salesforce integration. | Should |
| FR-245 | The system should support Slack export or sharing. | Could |
| FR-246 | The system shall require explicit authorization for each integration. | Must |
| FR-247 | The system shall allow users and admins to revoke integrations. | Must |
| FR-248 | The system shall generate pre-call briefs from calendar metadata, meeting history, workspace knowledge, and available participant context. | Must |
| FR-249 | The system shall include account or opportunity context in pre-call briefs when CRM integration is available and authorized. | Should |
| FR-250 | The system shall include unresolved prior action items in pre-call briefs when prior meeting memory is available. | Must |
| FR-251 | The system shall identify source material used in pre-call briefs where source metadata is available. | Should |

### 4.14 Administration

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-260 | The system shall support workspace membership management. | Must |
| FR-261 | The system shall support user roles, including owner, admin, and member. | Must |
| FR-262 | The system shall support workspace-level capture and retention policies. | Must |
| FR-263 | The system shall support disabling screen context at the workspace level. | Should |
| FR-264 | The system shall support audit logs for admin actions. | Must |
| FR-265 | The system shall provide usage analytics without exposing meeting content by default. | Should |
| FR-266 | The system should support SSO/SAML for enterprise workspaces. | Should |

### 4.15 Billing and Plans

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-280 | The system shall support free and paid plans. | Should |
| FR-281 | The system shall enforce usage limits by plan. | Should |
| FR-282 | The system shall support workspace billing. | Should |
| FR-283 | The system shall expose usage meters for transcription minutes, AI suggestions, and storage. | Should |

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement |
| --- | --- |
| NFR-001 | The system should display the first useful live suggestion within 3 seconds of a detected question under normal network conditions. |
| NFR-002 | The desktop overlay should render updates within 100 ms of receiving suggestion data. |
| NFR-003 | The desktop client should remain responsive while audio capture, STT, and context extraction are active. |
| NFR-004 | CPU usage should remain below 20% average on a modern laptop during normal cloud-STT operation. |
| NFR-005 | Memory usage should remain below 500 MB for the desktop client during a typical meeting. |

### 5.2 Reliability

| ID | Requirement |
| --- | --- |
| NFR-020 | The system shall gracefully recover from temporary network interruptions. |
| NFR-021 | The system shall preserve local meeting state during backend outages where feasible. |
| NFR-022 | The system shall not crash if audio devices are disconnected mid-meeting. |
| NFR-023 | The system shall retry failed post-call processing jobs. |
| NFR-024 | The backend shall target 99.5% monthly availability for MVP and 99.9% for enterprise release. |
| NFR-025 | The system shall implement the failure modes and recovery behavior defined in `docs/architecture/failure_modes.md`. |
| NFR-026 | The realtime session protocol shall support reconnection, resume, backpressure, and message versioning as defined in `docs/architecture/realtime_protocol.md`. |

### 5.3 Security

| ID | Requirement |
| --- | --- |
| NFR-040 | All network traffic shall use TLS 1.2 or later. |
| NFR-041 | Sensitive data shall be encrypted at rest. |
| NFR-042 | Authentication tokens shall be stored using platform-secure storage where available. |
| NFR-043 | The system shall enforce authorization checks on every document, meeting, and workspace resource. |
| NFR-044 | The system shall maintain audit logs for admin-sensitive operations. |
| NFR-045 | The system shall support deletion and retention controls. |
| NFR-046 | The system shall not use customer meeting data to train models unless explicitly contracted and enabled. |
| NFR-047 | The system shall enforce workspace isolation according to `docs/architecture/multi_tenancy.md`. |
| NFR-048 | The system shall maintain data-flow and trust-boundary documentation according to `docs/security/data_flows.md`. |
| NFR-049 | The system shall maintain and test against the threat model in `docs/security/threat_model.md`. |

### 5.4 Privacy and Compliance

| ID | Requirement |
| --- | --- |
| NFR-060 | The system shall provide clear user-facing controls for captured data types. |
| NFR-061 | The system shall support workspace retention periods. |
| NFR-062 | The system shall support user-initiated deletion where permitted by workspace policy. |
| NFR-063 | The system shall support data export for user-owned meeting records. |
| NFR-064 | The system shall provide documentation for consent, recording, and AI-assistance disclosures. |
| NFR-065 | The system shall support enterprise security review with clear subprocessors and data flow documentation. |

### 5.5 Usability

| ID | Requirement |
| --- | --- |
| NFR-080 | A new user should be able to complete onboarding and run a first meeting test within 10 minutes. |
| NFR-081 | Live suggestions should be concise enough to understand at a glance. |
| NFR-082 | The overlay should be operable primarily through keyboard shortcuts. |
| NFR-083 | The product should avoid unnecessary notifications during meetings. |
| NFR-084 | The user should be able to pause or stop capture within one action. |

### 5.6 Maintainability

| ID | Requirement |
| --- | --- |
| NFR-100 | The system shall separate capture, transcription, context, retrieval, and LLM orchestration into independently testable modules. |
| NFR-101 | Prompt templates shall be versioned. |
| NFR-102 | Model provider integrations shall be abstracted behind internal interfaces. |
| NFR-103 | The system shall include automated tests for critical backend and desktop service logic. |
| NFR-104 | The system shall include telemetry for latency, error rate, and suggestion delivery success. |

## 6. Data Requirements

### 6.1 Core Entities

| Entity | Key Fields |
| --- | --- |
| User | ID, email, name, settings, workspace memberships |
| Workspace | ID, name, policies, billing plan, integrations |
| MeetingSession | ID, workspace ID, user ID, start time, end time, participants, source, status |
| TranscriptSegment | ID, meeting ID, start time, end time, speaker label, text, confidence |
| Suggestion | ID, meeting ID, type, prompt version, content, sources, confidence, user feedback |
| Document | ID, workspace ID, owner ID, title, source, permissions, status |
| DocumentChunk | ID, document ID, text, embedding, metadata |
| ActionItem | ID, meeting ID, owner candidate, due date candidate, description, status |
| IntegrationConnection | ID, workspace ID, provider, scopes, status |
| AuditLog | ID, workspace ID, actor ID, action, target, timestamp |

### 6.2 Data Retention

The system shall support:

- No-storage mode for live-only usage.
- Local-only draft storage where technically feasible.
- Configurable cloud retention, such as 7 days, 30 days, 1 year, or indefinite.
- Admin-enforced retention policies.
- Deletion workflows for users and admins.

### 6.3 Sensitive Data Handling

The system shall treat the following as sensitive:

- Raw audio.
- Transcripts.
- Screen-captured text.
- Uploaded documents.
- Calendar metadata.
- CRM records.
- Generated suggestions.
- Meeting notes and follow-up drafts.

## 7. AI Behavior Requirements

### 7.1 Live Response Style

Live suggestions shall:

- Be short.
- Be conversational.
- Avoid long explanations unless requested.
- Prefer exact information from trusted sources.
- Include uncertainty when the answer is not well-supported.
- Avoid inventing product facts, pricing, policy, or commitments.

### 7.2 Source Grounding

When answers rely on retrieved knowledge, the system shall:

- Track source document IDs and chunk IDs.
- Show source labels where useful.
- Prefer direct company-approved material over generic model knowledge.
- Avoid answering with unsupported specifics when no relevant source is found.

### 7.3 Evaluation

The system shall support offline and online evaluation for:

- STT word error rate.
- Question detection precision and recall.
- Suggestion latency.
- Retrieval relevance.
- Hallucination rate.
- User acceptance rate.
- Post-call summary accuracy.

## 8. Compliance and Product Policy Boundaries

### 8.1 Approved Use Cases

The product shall be designed for authorized assistance in:

- Sales calls.
- Customer success calls.
- Internal meetings.
- Recruiting workflows where AI use is permitted.
- Consulting sessions.
- Support escalations.
- Training and coaching.

### 8.2 Disallowed Product Direction

The product shall not include requirements whose purpose is to:

- Bypass proctoring systems.
- Hide AI assistance from parties who are entitled to know under policy, law, or contract.
- Circumvent platform monitoring or access controls.
- Evade employer or interviewer rules.
- Defeat security tools.

### 8.3 Display Privacy

The product may include display privacy controls only for legitimate purposes, such as:

- Avoiding accidental exposure of private notes during presentations.
- Protecting sensitive internal context from customer-facing screen shares.
- Supporting user-controlled layouts that keep assistant content outside the shared area.

Such controls must be documented transparently and must not be positioned as undetectability or evasion.

## 9. MVP Scope

### 9.1 MVP Must-Haves

The MVP shall include:

- Windows and macOS desktop client.
- Authenticated user account.
- Manual meeting start and stop.
- Microphone capture.
- System audio capture where feasible.
- Streaming transcription.
- Live transcript view.
- Manual "suggest answer" hotkey.
- Live suggestion overlay.
- Document upload.
- Basic vector retrieval.
- Source-grounded answer generation.
- Post-call summary.
- Action item extraction.
- Follow-up email draft.
- Basic settings and capture controls.

### 9.2 MVP Exclusions

The MVP shall not include:

- Full CRM sync.
- SSO/SAML.
- Advanced coaching analytics.
- Full browser extension context.
- Mobile app.
- Offline-only mode.
- Custom enterprise deployment.
- Evasion-oriented undetectability features.

## 10. Future Enhancements

Potential future releases may include:

- Salesforce and HubSpot writeback.
- ATS integration for recruiting workflows.
- Team coaching dashboards.
- Local-first transcription and retrieval.
- Browser extension for structured web context.
- Meeting bot mode for customers that prefer bot-based capture.
- Advanced pre-call briefs.
- Custom workflow buttons.
- Enterprise data residency.
- SOC 2 readiness program.
- Granular transcript redaction.

## 11. Acceptance Criteria

### 11.1 MVP Acceptance Criteria

The MVP is acceptable when:

- A user can install the desktop app on Windows and macOS.
- A user can authenticate and complete onboarding.
- A user can start a meeting session manually.
- The app captures permitted audio and produces a live transcript.
- The app generates a useful suggestion from a manual hotkey within 3 seconds under normal conditions.
- The app retrieves relevant uploaded document context for at least simple factual questions.
- Generated answers include source metadata when based on uploaded documents.
- The app produces a post-call summary, action items, and follow-up draft.
- The user can pause and stop capture.
- The user can delete a meeting record.
- The app handles missing permissions and disconnected devices without crashing.

### 11.2 Quality Gates

Before public beta:

- Crash-free desktop sessions should exceed 99%.
- P95 manual suggestion latency should be below 3 seconds.
- P95 overlay render latency should be below 100 ms after receiving data.
- STT provider failures should produce visible fallback/error states.
- Security review should confirm encryption, auth, retention, and access controls.
- Prompt evaluation should demonstrate low hallucination rates on source-grounded Q&A test sets.

## 12. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| macOS system audio capture is unreliable | Poor meeting support on macOS | Use ScreenCaptureKit where available, provide clear setup, evaluate approved audio routing options. |
| Live suggestions arrive too late | Product feels useless | Optimize STT streaming, event detection, retrieval, and first-token latency. |
| Suggestions are generic | Weak differentiation | Invest in RAG, role-specific prompts, CRM/calendar context, and source grounding. |
| Hallucinated answers damage trust | Customer churn and legal risk | Use source-grounded generation, uncertainty handling, answer validation, and feedback loops. |
| Privacy concerns block adoption | Enterprise sales friction | Provide transparent controls, retention policies, audit logs, and local-processing options. |
| Overlay distracts users | Poor UX | Provide compact mode, ranking, suppression, and manual trigger mode. |
| Cloud AI costs scale poorly | Margin pressure | Debounce calls, use routing models, summarize context, cache retrieval, and optimize token budgets. |

## 13. Development Roadmap

### Phase 1: Desktop Skeleton

- Create Tauri v2 desktop shell.
- Implement main window and overlay.
- Add global hotkeys.
- Add local settings storage.
- Add basic logging.

### Phase 2: Audio and STT

- Implement microphone capture.
- Implement system audio capture per platform.
- Add VAD and chunking.
- Integrate streaming STT.
- Display live transcript.

### Phase 3: Live Suggestions

- Build context manager.
- Add manual suggestion hotkey.
- Integrate LLM provider.
- Stream response tokens to overlay.
- Add suggestion actions.

### Phase 4: Knowledge Base

- Add document upload.
- Parse and chunk documents.
- Generate embeddings.
- Implement retrieval.
- Add source-grounded answers.

### Phase 5: Post-Call Output

- Generate summaries.
- Extract action items.
- Draft follow-up emails.
- Add export and edit workflows.

### Phase 6: Beta Readiness

- Add onboarding.
- Add telemetry.
- Add error handling.
- Add retention controls.
- Add billing or usage limits.
- Run cross-platform QA.

## 14. Open Questions

- Which STT provider should be used for the first beta?
- Did the Tauri v2 implementation spike satisfy the ADR acceptance criteria?
- What is the first target user segment: sales, recruiting, consulting, or general meetings?
- Which integrations are mandatory for beta customers?
- What retention policies should be available at launch?
- What level of local processing is required for privacy-sensitive users?
- What legal consent/disclosure copy should be shown during onboarding?
