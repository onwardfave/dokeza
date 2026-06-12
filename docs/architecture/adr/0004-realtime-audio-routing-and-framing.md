# ADR 0004: Realtime Audio Routing and Framing

## Status

Accepted for initial implementation.

## Context

The desktop client and realtime backend need an exact audio transport contract before implementation. The system also needs a clear STT routing policy because direct browser or desktop connections to STT providers can reduce backend bandwidth but make workspace policy, credential isolation, telemetry, and provider retention enforcement harder to prove.

## Decision

Route all cloud STT traffic through the Dokeza realtime service for the initial implementation.

The desktop sends audio to Dokeza over the realtime WebSocket. The realtime service forwards audio to cloud STT providers through an internal STT adapter using Dokeza-managed credentials and workspace policy checks.

Use JSON control frames and binary PCM audio frames for protocol version `2026-06-12`. Every audio chunk is a strict two-frame pair:

1. `audio.chunk_meta` JSON message.
2. One immediate binary payload frame containing raw PCM bytes for that `chunk_id`.

The default local audio buffer cap is five minutes per active audio stream or 25 MB per active audio stream, whichever is lower. Workspace policy may lower or disable buffering. Dropped buffered audio must be reported with `audio.gap`.

## Rationale

Backend-routed STT keeps policy enforcement and provider credentials server-side while the product is still validating its realtime, privacy, and enterprise-readiness claims.

The two-frame audio pair keeps JSON contracts readable and testable while avoiding base64 overhead for audio. It is simpler than a custom binary envelope for the first implementation and still leaves room to introduce a more compact envelope later if measured overhead justifies it.

## Consequences

- Direct client-to-provider STT requires a future ADR, token-broker design, data-flow update, and workspace policy controls.
- Realtime contract tests must cover metadata/payload pairing, byte-length mismatch, out-of-order chunks, reconnect, backpressure, and `audio.gap`.
- Failure-mode tests must verify that dropped buffered audio is represented in the session timeline.
- Provider adapters must not expose provider credentials to the desktop client.
