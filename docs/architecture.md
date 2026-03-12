# Architecture

## System Shape

Fence Estimator is a monorepo with a browser editor, a Fastify API, and shared domain packages.

- `apps/web`: UI, portal navigation, editor orchestration, and browser persistence flows
- `apps/api`: auth, persistence, audit log, estimate endpoints, and operational endpoints
- `packages/contracts`: shared DTOs and boundary validation
- `packages/geometry`: pure geometry helpers
- `packages/rules-engine`: deterministic layout-to-estimate logic

## Runtime Flow

1. A user authenticates through the API and receives a cookie-backed session.
2. The web app loads company-scoped drawings, users, and audit data as permitted by role.
3. The editor builds live derived state from the current layout.
4. On save, the API normalizes the layout, re-runs the rules engine, versions the drawing, and stores the estimate snapshot.
5. Audit entries capture auth, user-management, archive, and version-restore actions.

## Persistence Model

- SQLite stores companies, users, sessions, drawings, drawing versions, password-reset artifacts, and audit log entries.
- Drawings persist normalized layout JSON plus deterministic estimate JSON.
- Drawings carry `schemaVersion`, `rulesVersion`, and `versionNumber`.
- Archive and restore flows are company-scoped and version-aware.

## Recovery Model

- user recovery is manager-driven, not public self-service
- active sessions are revoked after a manager or operator reset
- operator recovery is handled through CLI tooling against the production database
- first-owner bootstrap can be gated by a deployment-managed one-time secret

## Current Production Envelope

This codebase is now appropriate for a single-instance internal deployment with:

- one API process
- one web build
- one persistent SQLite database
- scheduled backups and tested restore procedure
- proxy-aware client IP forwarding when deployed behind a reverse proxy

## Remaining Architectural Limits

- SQLite keeps the deployment single-instance
- the editor route is still a large orchestration surface even though the logic underneath is now better tested
- there is no external identity provider or self-service invite flow
