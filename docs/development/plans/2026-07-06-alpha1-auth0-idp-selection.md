# Alpha.1 Auth0 IdP Selection Plan

## Goal

Resolve the production-alpha hosted identity provider and desktop redirect strategy so the desktop sign-in implementation can proceed without changing the existing provider-neutral API exchange boundary.

## Requirements and Milestone

- Milestone: Alpha.1 production auth and onboarding.
- SRS coverage: FR-020 to FR-025, NFR-040 to NFR-049, NFR-080.
- Progress tracker items: hosted IdP vendor selection and desktop redirect/SDK strategy definition.

## Affected Architecture

- API keeps the existing OIDC/JWKS provider verification boundary at `POST /v1/auth/provider/exchange`.
- Desktop uses the operating-system browser for hosted sign-in.
- Dokeza-owned workspace membership remains authoritative after provider token verification.

## Contracts and Data Model

No REST, realtime, or database contract changes are required for this decision checkpoint.

The next implementation slice should add desktop-side Auth0 Native Application configuration and the Authorization Code with PKCE flow without leaking Auth0-specific response shapes past the desktop auth boundary or API provider-token exchange boundary.

## Security and Privacy

- Selected provider for production alpha: Auth0.
- Desktop strategy: Auth0 Native Application using Authorization Code with PKCE in the system browser.
- Alpha callback strategy: loopback redirect on `127.0.0.1` with an exact configured callback URI, high-entropy `state`, `nonce`, PKCE verifier/challenge, and a short callback listener lifetime.
- Desktop must not ship a client secret.
- Provider refresh tokens and Dokeza API session tokens remain restricted secrets and are stored only through platform secure storage where available.
- Provider tokens are submitted only to `POST /v1/auth/provider/exchange`; realtime and resource APIs continue to reject hosted provider tokens.
- No transcript, prompt, document, suggestion, or raw audio content is sent to Auth0.

## Implementation Tasks

1. Document Auth0 as the production-alpha hosted IdP.
2. Document the desktop Authorization Code with PKCE strategy.
3. Update data-flow, threat-model, failure-mode, local-environment, and progress docs.
4. Leave the actual desktop redirect implementation open for the next Alpha.1 slice.

## Tests and Verification

This checkpoint is documentation-only. Run `pnpm check` before committing to keep formatting, lint, typecheck, and tests green.

The next implementation slice should add desktop unit tests for state/nonce validation, callback timeout, cancellation, token exchange success, and token redaction.

## Documentation Updates

- `docs/architecture/authentication.md`
- `docs/security/data_flows.md`
- `docs/security/threat_model.md`
- `docs/architecture/failure_modes.md`
- `docs/development/local_environment.md`
- `docs/development/progress.md`
- `docs/development/plans/2026-07-06-production-alpha-gate.md`

## Rollback or Degraded Behavior

If Auth0 is unavailable, Dokeza fails closed for new sign-ins and token refresh. Existing authenticated desktop state may continue only until existing Dokeza tokens expire. Development auth remains a local/test-only fallback and is not a production fallback.

If loopback callback handling fails, desktop should close the local listener, discard the pending verifier/state, show a sanitized sign-in failed or canceled state, and allow a new sign-in attempt.

## Open Questions

- Whether the first signed alpha release should keep loopback redirect or move to a claimed HTTPS/custom-domain redirect after installer signing and release-channel work.
- Whether first alpha membership remains individual-owner-first or adds admin-managed invitations before the design-partner cohort.
