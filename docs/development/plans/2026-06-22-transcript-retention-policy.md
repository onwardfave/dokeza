# Transcript Retention Policy Implementation Plan

## Goal

Enforce workspace retention policy at the realtime transcript timeline boundary so `live_only` and `local_only` sessions do not persist transcript segments or audio gaps to cloud timeline storage.

## Requirements and Milestone

- FR-063: store transcript segments with timestamps when persistence is allowed.
- FR-104: persist meeting records according to workspace retention settings.
- FR-105: allow local and cloud meeting record deletion where policy allows.
- FR-262: support workspace-level capture and retention policies.
- NFR-045, NFR-061, NFR-062: support retention and deletion controls.
- NFR-047, NFR-048, NFR-049: preserve workspace isolation, data-flow documentation, and threat-model alignment.
- Milestone: Realtime Platform / Admin and Enterprise foundations.

## Affected Architecture

- Realtime service WebSocket server.
- Transcript timeline sink boundary.
- Auth accepted policy payload already carries `retention_mode`; no realtime message shape change is required.

## Contracts and Data Model

- No new protocol messages.
- No schema generation required unless contract types are exported differently.
- The server should advertise the active retention mode in `auth.accepted.payload.policy.retention_mode`.
- Timeline writes remain workspace- and session-scoped.

## Security and Privacy

- `live_only` and `local_only` are hard blocks on cloud transcript and gap persistence.
- Cloud retention modes (`7_days`, `30_days`, `1_year`, `indefinite`) allow timeline persistence.
- Policy decisions and telemetry must not include transcript text, raw audio, prompts, suggestions, or documents.
- Deny-by-default behavior should be used when an unknown retention mode reaches the policy helper.

## Implementation Tasks

1. Add a pure transcript retention policy helper in `services/realtime`.
2. Add unit tests for all retention modes and metadata-only decision telemetry.
3. Add realtime server tests proving:
   - advertised retention mode follows server options;
   - final transcripts still stream live in no-storage modes;
   - transcript final writes are skipped for `live_only` and `local_only`;
   - audio gap writes are skipped for `live_only`;
   - cloud retention modes still persist.
4. Wire the policy helper before `recordTranscriptEvent` and `recordGap`.
5. Export the helper types for downstream durable sink implementations.

## Tests and Verification

- Targeted:
  - `pnpm --filter @dokeza/realtime test`
  - `pnpm --filter @dokeza/realtime typecheck`
- Full:
  - `pnpm check`

## Documentation Updates

- Update `docs/security/data_flows.md` to document the enforced no-storage behavior.
- Update the realtime transcript timeline property catalog with retention/no-storage invariants.
- No realtime protocol update is expected because message shapes are unchanged.

## Rollback or Degraded Behavior

- If policy evaluation fails or receives an unknown mode, skip cloud transcript persistence.
- Live transcript streaming continues even when timeline persistence is skipped.
- Existing `transcript_persistence_failed` remains reserved for actual sink failures after policy allows persistence.

## Open Questions

- Workspace policy resolution is still static in the realtime server. A future slice should load retention mode from a workspace policy service instead of process-level options.
- Local encrypted draft storage is not implemented here; `local_only` only blocks cloud persistence in the current service.
