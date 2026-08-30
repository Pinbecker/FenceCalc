# Operations

## Service checks

- `GET /livez` proves that the API process can answer HTTP. It does not touch the database.
- `GET /readyz` proves that the API can reach the database and read its migration version. Load balancers and container health checks must use this endpoint.
- `GET /health` is a compatibility alias for readiness.
- `GET /metrics` emits Prometheus metrics. Set `METRICS_BEARER_TOKEN` in any environment where this endpoint is reachable outside a private monitoring network.

Every API response includes `x-request-id`. Structured logs include the same request ID, route, status and elapsed time. Error reporting can be enabled with the Sentry environment variables in `.env.example`; personally identifiable request bodies are not sent.

## Service objectives

The initial commercial operating target is:

- monthly API availability: 99.9%, measured by successful `/readyz` probes
- interactive API latency: p95 below 500 ms and p99 below 1.5 s, excluding document generation
- quote PDF latency: p95 below 3 s
- server error rate: below 1% over any rolling 15-minute window
- recovery point objective (RPO): 15 minutes
- recovery time objective (RTO): 2 hours

The 99.9% target permits about 43 minutes of unavailability in a 30-day month. Pause non-essential releases when half of that monthly error budget has been consumed; stop feature releases and work the reliability issue when the budget is exhausted.

Recommended alerts:

- readiness fails for 3 consecutive minutes
- 5xx rate exceeds 2% for 10 minutes
- p95 interactive request latency exceeds 1 second for 15 minutes
- PostgreSQL connection use exceeds 80% of the configured pool for 15 minutes
- latest verified backup is older than 24 hours
- disk capacity is below 20% or forecast to exhaust within 7 days
- Sentry reports a new unhandled production exception

## PostgreSQL migrations

Production uses PostgreSQL. Migrations are a release step and execute under a database advisory lock. Build the API before running a local migration command:

```powershell
$env:DATABASE_URL = "postgresql://fence_estimator:replace-me@database.example.com:5432/fence_estimator"
npm run build --workspace @fence-estimator/api
npm run migrate:postgres --workspace @fence-estimator/api
```

The checked-in Compose stack runs its one-shot `migrate` service after PostgreSQL is healthy and before the API starts. `SKIP_AUTO_MIGRATION=true` keeps normal API replicas from changing schema during startup.

Release rules:

1. Take and verify a backup before a schema change.
2. Exercise the migration against a recent restored copy.
3. Apply the migration once, then start the new API version.
4. Confirm `/readyz` reports the expected provider and schema version.
5. Prefer expand-and-contract changes when old and new API versions may overlap.

## PostgreSQL backup and recovery

Use managed PostgreSQL automated backups with point-in-time recovery in hosted environments. Retain at least 30 daily restore points and keep a copy in a separate failure domain.

Example logical backup:

```powershell
$env:PGPASSWORD = "replace-me"
pg_dump --host database.example.com --username fence_estimator --format custom --file C:\Backups\fence-estimator.dump fence_estimator
```

Example restore into a new, empty validation database:

```powershell
$env:PGPASSWORD = "replace-me"
createdb --host database.example.com --username fence_estimator fence_estimator_restore_test
pg_restore --host database.example.com --username fence_estimator --dbname fence_estimator_restore_test --clean --if-exists C:\Backups\fence-estimator.dump
```

Never test a restore over the live database. At least quarterly:

1. Restore the latest production backup into an isolated database.
2. Start the current API against it.
3. verify `/readyz`, login, a recent customer, a drawing revision, an approved estimate, an issued quote PDF and the audit trail.
4. Record actual RPO and RTO and address any miss.

## Local SQLite recovery

SQLite remains supported for local development only. The existing `backup:sqlite` and `restore:sqlite` scripts can protect a developer database, but SQLite is not an accepted production provider. Local database files and their `-wal` or `-shm` sidecars must not be committed.

## Incident sequence

1. Confirm `/livez` and `/readyz` separately to distinguish process failure from dependency failure.
2. Correlate the failing request ID through proxy, API and Sentry logs.
3. Check request error/latency metrics and PostgreSQL saturation before restarting anything.
4. Preserve logs and database evidence, then apply the smallest recovery action.
5. If data integrity is in doubt, stop writes, take a forensic backup and restore into an isolated environment for validation.
6. Record impact, timeline, cause, recovery and follow-up actions in a blameless incident review.
