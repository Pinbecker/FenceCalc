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
- `BOOTSTRAP_OWNER_SECRET` set until the first owner is created, then removed from the runtime environment
- `VITE_API_BASE_URL` pointed at the production API origin during web build

## Build and Release

Build the full repo:

```powershell
npm run build
```

Recommended deploy sequence:

1. Build and test in CI.
2. Snapshot the current production database.
3. Deploy the API build and web build.
4. Start the API with the production environment.
5. Run a smoke test: login, drawings page, editor save, admin page, `/health`.

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
