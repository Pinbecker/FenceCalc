# Deployment

## Supported production shape

The commercial deployment target is:

- one or more stateless API replicas
- one immutable web build
- PostgreSQL on durable managed storage
- HTTPS at the only publicly reachable reverse proxy or load balancer
- centralized logs, Prometheus-compatible metrics and error reporting

SQLite is retained for local development and is rejected by production configuration validation.

## Required environment

Start from `.env.example`. Production requires:

- `NODE_ENV=production`
- `DATABASE_PROVIDER=postgresql` and a TLS-protected `DATABASE_URL`
- pool and timeout values appropriate to the database connection limit
- `SKIP_AUTO_MIGRATION=true`; run the migration job separately
- exact `ALLOWED_ORIGINS` and `ENFORCE_WRITE_ORIGIN=true`
- `SESSION_COOKIE_SECURE=true` and a `SESSION_COOKIE_NAME` beginning with `__Host-`
- `TRUST_PROXY=true` only behind the trusted proxy
- a high-entropy `METRICS_BEARER_TOKEN` unless metrics are isolated on a private network
- Sentry configuration when external error reporting is enabled
- `BOOTSTRAP_OWNER_SECRET` only until the initial owner exists
- `VITE_API_BASE_URL` and browser telemetry values at web build time

Do not put database passwords, session material, Sentry auth tokens or bootstrap secrets in source control or image layers. Use the deployment platform's secret manager.

## Release sequence

1. Run lint, type checks, unit/integration tests, browser tests and the production build in CI.
2. Build immutable API and web images and identify them by commit SHA.
3. Verify the latest database backup and exercise the migration against a restored copy.
4. Run the one-shot PostgreSQL migration job.
5. Deploy the API with readiness pointed at `/readyz` and liveness pointed at `/livez`.
6. Deploy the web image built for the production API origin.
7. Smoke-test login, customer/project navigation, drawing save, estimate calculation, quote PDF download, admin access and metrics collection.
8. Watch 5xx rate, p95 latency and readiness during the release window. Roll the application image back if those regress; do not roll a database schema backward without an approved recovery plan.

## Checked-in Compose stack

For a production-shaped local exercise:

```powershell
$env:POSTGRES_PASSWORD = "replace-with-a-long-random-value"
$env:METRICS_BEARER_TOKEN = "replace-with-a-long-random-value"
docker compose up --build
```

The stack contains PostgreSQL, a one-shot migration service, the API, the web build and the HTTPS reverse proxy. Only the proxy publishes host ports. The database, API and web services remain on the internal network.

The default Compose database password exists only to make isolated local evaluation possible. It must be overridden anywhere the machine or network is shared.

## Scaling rules

- Keep API replicas stateless; sessions, sequences and tenant data live in PostgreSQL.
- Size `DATABASE_POOL_MAX * replica_count` below the database connection ceiling with headroom for migrations and operators.
- The in-process login and write limiters provide burst protection per replica. Put a shared edge rate limiter in front of a multi-replica public service.
- Run migrations once per release, not once per replica.
- Drain a replica only after it fails readiness; do not use liveness failure for ordinary database degradation.

## Rollback

Application rollback is a redeploy of the last known-good immutable images. Database changes must be backward compatible across the release window. Destructive schema cleanup belongs in a later release after old code is gone and a verified backup exists.
