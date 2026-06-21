# Deepgram STT Adapter Implementation Plan

## Goal

Add a Deepgram speech-to-text adapter behind the existing realtime `SttAdapter` boundary. The adapter will translate internal audio chunk metadata into Deepgram streaming request options, map Deepgram result messages back into Dokeza transcript events, and expose metadata-only telemetry for provider interaction.

This slice introduces the concrete external STT provider contract but keeps the default local deterministic adapter available for tests and development.

## Requirements and Milestone

| SRS Area | Requirement IDs | Milestone |
| --- | --- | --- |
| Speech-to-text | FR-060 to FR-064, FR-067 | Milestone 1 |
| Meeting session management | FR-100 to FR-104 | Milestone 1 |
| Reliability | NFR-020, NFR-025, NFR-026 | Milestone 1 |
| Security and isolation | NFR-043, NFR-047, NFR-048 | Milestone 1 / enterprise baseline |
| Maintainability and telemetry | NFR-100, NFR-103, NFR-104 | Milestone 0 / Milestone 1 |

## Affected Architecture

- `packages/config/src/index.ts` - add Deepgram STT configuration with production validation.
- `services/realtime/src/deepgram-stt-adapter.ts` - new provider adapter and injectable transport contract.
- `services/realtime/src/index.ts` - export Deepgram adapter types for server composition.
- `services/realtime/src/*.test.ts` and `packages/config/src/*.test.ts` - unit coverage for provider mapping, error handling, telemetry redaction, and config validation.
- `docs/security/data_flows.md` - document the concrete Deepgram audio egress path.

## Contracts and Data Model

- **Realtime protocol**: No schema change. The adapter emits existing `transcript.partial` and `transcript.final` messages.
- **REST API**: No change.
- **Data model**: No database persistence in this slice. Raw audio and provider result messages remain transient in process memory.
- **Provider contract**: Deepgram request options include model, language, audio encoding, sample rate, channels, and interim result preference. Authentication is server-side only.
- **Telemetry event**: Add metadata-only provider telemetry. Telemetry must not include raw audio bytes, transcript text, provider API keys, prompts, documents, or suggestions.

## Security and Privacy

- Deepgram credentials are read from server environment/configuration only and are never sent to browser clients.
- Raw audio leaves the realtime service only through the configured Deepgram STT egress path.
- Tests use a fake transport and must not call the live Deepgram service.
- Error messages and telemetry may include provider name, model, stream name, chunk index, timing, and failure category, but not raw audio, transcripts, or credentials.
- `docs/security/data_flows.md` must be updated because this slice makes the external STT flow concrete.

## Implementation Tasks

1. Add config tests for default Deepgram STT settings and production API key validation.
2. Add Deepgram adapter tests for:
   - request option construction and server-side authorization header.
   - partial and final result mapping to Dokeza transcript events.
   - empty or non-result provider messages being ignored.
   - provider failures mapping to recoverable STT errors.
   - telemetry redaction of transcript text, raw audio, and credentials.
3. Implement Deepgram STT config parsing and validation.
4. Implement `DeepgramSttAdapter` with an injectable transport interface.
5. Export the adapter and provider types from the realtime package.
6. Update `docs/security/data_flows.md` with the Deepgram audio egress details.
7. Run focused package tests, commit, then run full `pnpm check`.

## Tests and Verification

- `pnpm --filter @dokeza/config test`
- `pnpm --filter @dokeza/config typecheck`
- `pnpm --filter @dokeza/realtime test`
- `pnpm --filter @dokeza/realtime typecheck`
- `pnpm check`

Required behavior:

- Deepgram request options are deterministic and do not expose credentials to client-facing code.
- Interim Deepgram results become `transcript.partial`; final Deepgram results become `transcript.final`.
- Empty transcripts do not emit client events.
- Provider failures are recoverable and do not log content.
- Telemetry contains no transcript text, raw audio bytes, or API keys.

## Documentation Updates

- This implementation plan.
- `docs/security/data_flows.md` for the concrete Deepgram egress path.
- No realtime protocol update is required because no message schema changes.
- No failure mode update is required unless this slice adds a new user-visible failure behavior beyond existing recoverable STT provider errors.

## Rollback or Degraded Behavior

- The deterministic STT adapter remains available as the local/test fallback.
- If Deepgram credentials are missing in production, configuration validation fails before serving realtime traffic.
- If the provider transport fails during a session, the adapter returns a recoverable `stt_provider_timeout` error and the realtime session can continue accepting later audio chunks.

## Open Questions

- Should the next slice introduce a long-lived session-scoped Deepgram WebSocket transport instead of per-chunk transport calls?
- Should language and model become workspace-level policy settings once workspace administration exists?
