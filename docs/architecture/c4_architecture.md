# Dokeza C4 Architecture

## 1. Purpose

This document defines Dokeza's architecture boundaries using a C4-style model. It is intended to remove ambiguity between desktop, backend, AI, integrations, and security workstreams.

## 2. Level 1: System Context

```mermaid
flowchart LR
    User[Professional User]
    Admin[Workspace Admin]

    Dokeza[Dokeza Platform]

    Meeting[Meeting Platforms\nZoom, Meet, Teams, Slack]
    Calendar[Calendar Providers\nGoogle, Microsoft]
    Email[Email Providers\nGmail, Outlook]
    CRM[CRM Systems\nSalesforce, HubSpot]
    ATS[ATS Systems\nGreenhouse, Ashby]
    Support[Support Systems\nZendesk, Linear]
    Docs[Knowledge Sources\nDrive, Notion, Confluence]
    STT[STT Providers\nDeepgram, AssemblyAI]
    LLM[LLM Providers\nOpenAI, Anthropic, Google]
    Billing[Billing Provider]
    IdP[Identity Providers\nGoogle, Microsoft, SAML]

    User -->|Uses desktop and web apps| Dokeza
    Admin -->|Configures policies and integrations| Dokeza
    Dokeza -->|Captures authorized meeting context| Meeting
    Dokeza -->|Reads events| Calendar
    Dokeza -->|Creates drafts| Email
    Dokeza -->|Reads and writes approved updates| CRM
    Dokeza -->|Reads and writes approved updates| ATS
    Dokeza -->|Reads and writes approved updates| Support
    Dokeza -->|Ingests authorized documents| Docs
    Dokeza -->|Streams audio or receives transcripts| STT
    Dokeza -->|Sends prompts and receives generations| LLM
    Dokeza -->|Manages subscriptions| Billing
    Dokeza -->|Authenticates users| IdP
```

## 3. Level 2: Containers

```mermaid
flowchart TB
    subgraph Device[User Device]
        Desktop[Desktop Client\nTauri v2]
        Overlay[Live Overlay]
        LocalStore[Local SQLite Cache]
        BrowserExt[Browser Extension]
    end

    subgraph Cloud[Dokeza Cloud]
        API[API Gateway]
        Realtime[Realtime Session Service]
        Context[Context Service]
        Orchestrator[AI Orchestrator]
        Knowledge[Knowledge Service]
        Workflow[Workflow Service]
        Admin[Admin Service]
        BillingSvc[Billing Service]
        Eval[Evaluation Service]
    end

    subgraph Data[Data Stores]
        Postgres[(PostgreSQL)]
        Vector[(Vector Store)]
        ObjectStore[(Object Storage)]
        Secrets[(Secrets Manager)]
        Queue[(Queue / Workflow Engine)]
        Metrics[(Telemetry Store)]
    end

    Desktop --> Overlay
    Desktop --> LocalStore
    BrowserExt --> Desktop
    Desktop <-->|WSS session protocol| Realtime
    Desktop <-->|HTTPS REST| API

    API --> Admin
    API --> Knowledge
    API --> Workflow
    API --> BillingSvc
    Realtime --> Context
    Context --> Knowledge
    Context --> Orchestrator
    Orchestrator --> Eval
    Workflow --> Queue

    Admin --> Postgres
    Knowledge --> Postgres
    Knowledge --> Vector
    Knowledge --> ObjectStore
    Workflow --> Postgres
    Workflow --> Secrets
    BillingSvc --> Postgres
    Realtime --> Metrics
    Orchestrator --> Metrics
```

## 4. Level 3: Desktop Components

```mermaid
flowchart TB
    subgraph Desktop[Desktop Client]
        UI[Main UI Webview]
        Overlay[Overlay Webview]
        Session[Session Controller]
        Audio[Audio Capture Adapter]
        VAD[VAD and Chunker]
        Screen[Screen Context Adapter]
        Browser[Browser Extension Bridge]
        Protocol[Realtime Protocol Client]
        Cache[Local Cache]
        Permissions[Permission Manager]
        Updates[Update Manager]
        Diagnostics[Diagnostics Reporter]
    end

    UI --> Session
    Overlay --> Session
    Session --> Audio
    Audio --> VAD
    Session --> Screen
    Browser --> Session
    Session --> Protocol
    Session --> Cache
    Permissions --> Audio
    Permissions --> Screen
    Updates --> UI
    Diagnostics --> Cache
    Diagnostics --> Protocol
```

### 4.1 Desktop Process Boundaries

| Component | Recommended Boundary | Notes |
| --- | --- | --- |
| Main UI | Webview renderer | Onboarding, settings, meeting review. |
| Overlay UI | Separate webview/window | Must stay responsive during capture and transcription. |
| Audio capture | Native thread or sidecar | Avoid blocking UI. Use platform APIs through Rust or native modules. |
| VAD/chunking | Native worker thread | Handles CPU-sensitive realtime processing. |
| Local STT | Optional sidecar process | Allows independent crash recovery and model lifecycle. |
| Realtime protocol | Native/backend process | Maintains WSS connection and buffering. |
| Diagnostics | Background worker | Redacts sensitive content by default. |

## 5. Level 3: Backend Components

```mermaid
flowchart TB
    Realtime[Realtime Session Service]
    Gateway[API Gateway]
    Auth[Auth Middleware]
    SessionState[Session State Manager]
    STTAdapter[STT Adapter]
    Transcript[Transcript Processor]
    EventDetector[Event Detector]
    Retrieval[Retrieval Coordinator]
    Prompt[Prompt Assembler]
    ModelGateway[Model Gateway]
    Validator[Response Validator]
    Workflow[Workflow Engine]

    Gateway --> Auth
    Realtime --> Auth
    Realtime --> SessionState
    Realtime --> STTAdapter
    STTAdapter --> Transcript
    Transcript --> EventDetector
    EventDetector --> Retrieval
    Retrieval --> Prompt
    Prompt --> ModelGateway
    ModelGateway --> Validator
    Validator --> Realtime
    Transcript --> Workflow
```

## 6. Key Architecture Decisions

| Decision | Baseline |
| --- | --- |
| Desktop shell | Tauri v2, pending spike validation per `docs/architecture/adr/0001-desktop-shell-tauri-v2.md`. |
| Desktop-to-backend realtime transport | WebSocket over TLS. |
| Audio frame encoding | Binary frames for audio, JSON frames for control and events. |
| Backend runtime | TypeScript/Node.js for initial services, with generated JSON Schema contract artifacts. |
| Backend topology | Modular services behind an API gateway; monorepo acceptable initially. |
| Data store | Managed PostgreSQL for relational data, pgvector for initial embeddings, object storage for raw artifacts. |
| Workflow execution | Workflow service backed by a PostgreSQL job queue initially. |
| Provider abstraction | STT, embeddings, LLM, billing, and integrations must sit behind internal adapters. |
| Initial cloud STT provider | Deepgram through the backend STT adapter. |
| Initial LLM and embedding provider | OpenAI through the model gateway. |
| Workspace isolation | Enforced at every request and retrieval boundary. |
| Local-first readiness | Pipeline stages must declare cloud, local, or hybrid execution location. |
| Realtime STT routing | Desktop audio routes through the Dokeza realtime service before any cloud STT provider. |

## 7. Open Architecture Decisions

- Whether the Tauri v2 spike passes all accepted ADR criteria.
- When direct client-to-provider STT is worth reconsidering for enterprise policy exceptions.
- When vector isolation must move from pgvector shared tables to per-workspace collections or a dedicated vector store.
- Whether enterprise deployments require regional service stacks from the beginning.
