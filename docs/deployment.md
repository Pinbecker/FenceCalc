# Deployment

## Supported Deployment Shape

The current production target is:

- one API instance
- one built web deployment
- one SQLite database on persistent storage
- HTTPS terminated by a reverse proxy

This is appropriate for limited internal use. It is not the right shape for multi-instance scale.

## Required Environment

Use `.env.example` as the starting point.

Production requirements:

- `NODE_ENV=production`
- `TRUST_PROXY=true` when the API is behind the supported reverse proxy
- `DATABASE_PATH` set to an absolute persistent path
- `ALLOWED_ORIGINS` set to the exact browser origins allowed to call the API
- `SESSION_COOKIE_SECURE=true`
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, and `SENTRY_TRACES_SAMPLE_RATE` set if API error reporting is enabled
- `BOOTSTRAP_OWNER_SECRET` set until the first owner is created, then removed from the runtime environment
- `VITE_API_BASE_URL` pointed at the production API origin during web build
- `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE`, and `VITE_SENTRY_TRACES_SAMPLE_RATE` set during web build if browser error reporting is enabled
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` set during web build if sourcemaps should be uploaded to Sentry

## Build and Release

Build the full repo:

```powershell
npm run build
```

Recommended deploy sequence:

1. Build and test in CI.
2. Snapshot the current production database.
3. Build the API and web container targets or produce equivalent artifacts.
4. Start the API with the production environment.
5. Start the web build with the production API origin baked into `VITE_API_BASE_URL`.
6. Run a smoke test: login, drawings page, editor save, admin page, `/health`.

## Container Workflow

The repository now includes:

- a multi-stage `Dockerfile` with `api-runtime` and `web-runtime` targets
- a `.dockerignore` tuned for this monorepo
- a `docker-compose.yml` file for the supported single-instance production shape

Example local production-style run:

```powershell
docker compose up --build
```

## CI Expectations

The repository should pass:

- lint
- typecheck
- coverage gate
- build
- browser E2E

## Reverse Proxy Expectations

The reverse proxy should:

- terminate HTTPS
- forward requests to the API process
- forward the original client IP so Fastify proxy-aware request IP handling remains accurate
- serve the built web app
- preserve secure cookie behavior
- emit access logs outside the application

## When To Re-Platform

Move away from SQLite before calling this suitable for:

- multiple API replicas
- high write concurrency
- customer-hosted shared SaaS
- complex reporting or analytics workloads
