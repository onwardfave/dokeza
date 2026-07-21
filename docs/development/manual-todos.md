# Manual and Credential-Gated TODOs

This ledger contains work that cannot be completed safely through repository automation alone. Code should use explicit placeholders or fail-closed configuration until the required input is supplied. Never commit credential values to this file.

## Local Development

- [x] Resolved 2026-07-20: the "rejected credential" was a **host port conflict**, not a bad volume credential. Another project's Postgres (`autorank-local-postgres-1`) already published `127.0.0.1:5432`, so the dokeza container started with no host binding and all host-side connections hit the wrong server. Fix: `docker-compose.yml` now parameterizes the host port (`${DOKEZA_POSTGRES_HOST_PORT:-5432}`, default unchanged), and this machine sets `DOKEZA_POSTGRES_HOST_PORT=5433` (User scope). Local `DATABASE_URL` must use port **5433**. Migrations are current (0001–0007 applied).

## Production Alpha

- [ ] Provide or confirm the Auth0 production-alpha tenant domain, Native Application client ID, API audience, and exact allowed loopback callback URI.
- [ ] Confirm whether Auth0 will use a standard `*.auth0.com` tenant domain. If a vanity domain is required, review and add its exact HTTPS host to the Tauri opener capability before packaging.
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
- [ ] Review the production-alpha live-suggestion model's input/output prices and set `DOKEZA_LIVE_SUGGESTION_INPUT_MICROUSD_PER_MILLION_TOKENS` and `DOKEZA_LIVE_SUGGESTION_OUTPUT_MICROUSD_PER_MILLION_TOKENS`; priced hard-stop enforcement intentionally remains inactive until both values are present.
- [ ] Confirm or replace the placeholder `DOKEZA_LIVE_SUGGESTION_SESSION_COST_LIMIT_MICROUSD=150000` (15 US cents) and decide whether a lower warning threshold needs a user/admin surface before alpha.
- [ ] Confirm retention defaults and whether individual users may shorten or extend workspace policy.
- [ ] Name incident-response, privacy, security-review, and customer-support owners.
- [ ] Approve the initial subprocessor list and provider data-processing terms.
