# Workspace Membership Mutation Properties

## Scope

Owner, admin, and member mutations through the API identity repository.

## Invariants

- Every accepted mutation is authorized against current durable membership state, not token claims alone.
- Only a current owner can create, demote, or remove an owner membership.
- An accepted mutation never reduces the workspace owner count below one.
- Rejected mutations change neither membership nor audit state.
- A successful PostgreSQL upsert or delete and its metadata-only audit record commit atomically.
- Audit records contain workspace, actor, action, target type, and target ID; they contain no email, display name, provider token, transcript, prompt, or document content.

## Concurrency Model

PostgreSQL mutations lock the current workspace membership rows before evaluating the invariant. Competing owner removals therefore serialize against the same set: at most one may succeed when two owners remain.

## Executable Coverage

- In-memory policy tests cover admin escalation, admin owner removal, final-owner deletion/demotion, and ownership transfer.
- HTTP tests cover stable 403/409 failure contracts.
- PostgreSQL integration tests run as `dokeza_app`, exercise transactional owner rejection, race competing owner removals, and verify successful mutation audit rows.

## Follow-up

- Add audit pagination/export authorization when the admin audit API is introduced.
