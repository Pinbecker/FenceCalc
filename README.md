# Fence Estimator

Fence Estimator is a monorepo for a 2D fence layout editor, deterministic estimating engine, company-scoped drawing storage, and operational audit trail.

## Workspace

- `apps/web`: React + Konva portal, drawing editor, drawing library, and admin surface.
- `apps/api`: Fastify API for auth, drawing persistence, audit logging, and operational endpoints.
- `packages/contracts`: shared domain contracts and validation schemas.
- `packages/geometry`: pure geometry utilities.
- `packages/rules-engine`: deterministic fence counting and optimization rules.

## Current Product Profile

This repo is now shaped for a serious internal deployment:

- bootstrap-once owner account creation
- cookie-backed company sessions
- admin-managed user provisioning
- admin-managed password recovery with forced session revocation
- drawing save/load/archive/restore/version history
- audit log for auth, user management, and drawing operations
- unit, integration, and browser E2E coverage on critical workflows

It is still not positioned as a public self-service SaaS product. Self-service invite and email reset flows are intentionally absent.

## Local Start

1. Use Node 20+.
2. Install dependencies: `npm ci`
3. Copy `.env.example` if you want explicit local overrides.
4. Run the API: `npm run dev:api`
5. Run the web app: `npm run dev:web`

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:coverage`
- `npm run test:e2e`
- `npm run build`

## Runtime Configuration

See `.env.example` for the supported variables.

Important production rules:

- `DATABASE_PATH` must be an absolute path in `NODE_ENV=production`.
- `ALLOWED_ORIGINS` must be set explicitly in `NODE_ENV=production`.
- `SESSION_COOKIE_SECURE=true` is required in `NODE_ENV=production`.
- `TRUST_PROXY=true` should be set when the API runs behind the supported reverse proxy.
- `LOGIN_MAX_ATTEMPTS`, `LOGIN_ATTEMPT_WINDOW_MS`, and `LOGIN_LOCKOUT_MS` control account lockout after failed sign-ins.
- `AUDIT_LOG_RETENTION_DAYS` controls automatic audit-log retention and stale password-reset cleanup.
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, and `SENTRY_TRACES_SAMPLE_RATE` enable API-side error reporting.
- `BOOTSTRAP_OWNER_SECRET` should be set until the first owner account is created.
- `VITE_API_BASE_URL` should point at the deployed API origin when the web app is built for production.
- `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE`, and `VITE_SENTRY_TRACES_SAMPLE_RATE` enable browser-side error reporting.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are only required when uploading production web sourcemaps during the build.

## Containers

Build the API image:

```powershell
docker build --target api-runtime -t fence-estimator-api .
```

Build the web image:

```powershell
docker build --target web-runtime -t fence-estimator-web --build-arg VITE_API_BASE_URL=https://api.example.com .
```

Run the production-shaped local stack:

```powershell
docker compose up --build
```

Notes:

- the API container persists SQLite data under `/var/lib/fence-estimator`
- the web container is a static build, so `VITE_*` values must be present at build time, not only at runtime
- the checked-in compose file keeps `SESSION_COOKIE_SECURE=true`, so realistic browser auth smoke tests require HTTPS in front of the stack
- `docker-compose.yml` is intentionally single-instance and matches the current supported deployment shape

## Operations

- Deployment: [docs/deployment.md](/c:/Users/danco/CodingProjectsLocal/FenceEstimator/docs/deployment.md)
- Backups and restore: [docs/operations.md](/c:/Users/danco/CodingProjectsLocal/FenceEstimator/docs/operations.md)
- Account recovery: [docs/account-recovery.md](/c:/Users/danco/CodingProjectsLocal/FenceEstimator/docs/account-recovery.md)
- Architecture: [docs/architecture.md](/c:/Users/danco/CodingProjectsLocal/FenceEstimator/docs/architecture.md)

## Internal Recovery Model

For internal use, account recovery is intentionally manager-driven:

- an owner or admin can set another user’s password from the Admin page
- that action revokes the target user’s active sessions
- a sole locked-out owner is recovered through the operator CLI runbook, not a public reset token flow

## Remaining Gaps

- SQLite remains a single-instance deployment choice; use Postgres before attempting multi-instance or customer-facing scale.
- There is still no self-service invite or email delivery pipeline.
- Browser E2E coverage now exists for the critical internal flows, but it is not exhaustive across every editor interaction.
- Repo-local SQLite files under `apps/api/data` are for local development only and should never be treated as production storage.
