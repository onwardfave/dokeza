# Manual and Credential-Gated TODOs

This ledger contains work that cannot be completed safely through repository automation alone. Code should use explicit placeholders or fail-closed configuration until the required input is supplied. Never commit credential values to this file.

## Production Alpha

- [ ] Provide or confirm the Auth0 production-alpha tenant domain, Native Application client ID, API audience, and exact allowed loopback callback URI.
- [ ] Run installed-desktop Auth0 sign-in, restart restoration, refresh, sign-out, and revoked-session QA with a synthetic test account.
- [ ] Provide a funded OpenAI key if the production route must be tested specifically against OpenAI Responses and 1536-dimensional `text-embedding-3-small`; NVIDIA remains usable for adapter-boundary testing only.
- [ ] Run a 30-minute and then 60-minute Windows physical-microphone session after long-lived capture lands, including device unplug/replug and permission denial.
- [ ] Decide whether microphone-only capture is acceptable for the first design partner or Windows system-audio capture is an alpha blocker.
- [ ] Choose the first design-partner vertical and provide the acceptance rubric and synthetic knowledge examples for evaluation.
- [ ] Approve consent/disclosure copy and identify legal/privacy review ownership.

## Hosting and Release

- [ ] Select the initial cloud provider, production region, managed container runtime, and managed PostgreSQL offering.
- [ ] Confirm the exact production/staging API origins for `DOKEZA_API_ALLOWED_ORIGINS` (installed Tauri origin plus any hosted web origin); wildcard origins are intentionally unsupported.
- [ ] Provide access to the chosen cloud account and secret manager without placing credentials in the repository.
- [ ] Provision a Windows code-signing certificate and protected CI access to its material.
- [ ] Generate a Tauri updater signing key pair and store the private key/password in protected CI secrets.
- [ ] Choose updater artifact hosting and confirm the stable/beta release domains.
- [ ] Decide whether the first alpha is a hosted design-partner install or an explicitly supervised local install.

## Commercial and Operations

- [ ] Confirm API edge/application rate-limit thresholds and whether design partners require per-workspace quotas beyond the current per-credential/IP fixed-window guard.
- [ ] Set the initial per-meeting provider-cost warning and hard-stop thresholds.
- [ ] Confirm retention defaults and whether individual users may shorten or extend workspace policy.
- [ ] Name incident-response, privacy, security-review, and customer-support owners.
- [ ] Approve the initial subprocessor list and provider data-processing terms.
