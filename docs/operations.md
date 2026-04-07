# Operations

## Health and Logs

- Readiness endpoint: `GET /health`
- Fastify structured request logging is enabled; control verbosity with `LOG_LEVEL`
- In production, keep logs centralized outside the app process

## SQLite Storage Posture

For internal production use:

- store the SQLite database on a persistent disk outside the repo working tree
- keep the app single-instance
- do not place the live database on ephemeral container storage
- stop treating `apps/api/data` as a production location; that is a local-dev convenience only
- do not commit live SQLite `.db`, `-wal`, or `-shm` files into the repo

## Database Migrations

Migrations are a deliberate release step, not an automatic startup side effect. Run them explicitly before starting a new API version:

```powershell
npm run migrate --workspace @fence-estimator/api -- --database C:\srv\fence-estimator\fence-estimator.db
```

The script reports which migrations were applied. Always take a backup before migrating production.

If you are using the checked-in API container image, the same script is available inside the
container runtime:

```powershell
docker compose run --rm api npm run migrate --workspace @fence-estimator/api -- --database /var/lib/fence-estimator/fence-estimator.db
```

## Concurrency and Conflict Handling

Drawing mutations (update, archive, restore, status change) enforce optimistic concurrency at the database level. Every mutation requires the caller to supply the expected version number. If another request has modified the drawing since the caller last read it, the API returns `409 Conflict`. Clients should refresh and retry.

## Backup

Create a consistent SQLite snapshot:

```powershell
npm run backup:sqlite --workspace @fence-estimator/api -- --database C:\srv\fence-estimator\fence-estimator.db --output-dir C:\srv\fence-estimator\backups
```

The script writes:

- a `.db` backup file
- a sibling `.json` manifest with timestamp and file size

Minimum operating policy:

- run scheduled backups
- retain multiple restore points
- verify that backup output is copied to durable storage
- alert on backup failure

Containerized deployment note:

```powershell
docker compose run --rm api npm run backup:sqlite --workspace @fence-estimator/api -- --database /var/lib/fence-estimator/fence-estimator.db --output-dir /var/lib/fence-estimator/backups
```

## Restore

Restore a backup into the live database path:

```powershell
npm run restore:sqlite --workspace @fence-estimator/api -- --backup C:\srv\fence-estimator\backups\fence-estimator-2026-03-11T10-00-00-000Z.db --database C:\srv\fence-estimator\fence-estimator.db
```

Behavior:

- creates a `pre-restore` snapshot of the current target database when one exists
- restores the selected backup into the configured database path
- removes stale `-wal` and `-shm` sidecars after restore

Restore rules:

- stop the API process before restore
- confirm the restored database boots successfully
- verify recent drawings and users after the restore
- document every restore event

Containerized restore example:

```powershell
docker compose run --rm api npm run restore:sqlite --workspace @fence-estimator/api -- --backup /var/lib/fence-estimator/backups/fence-estimator-2026-03-11T10-00-00-000Z.db --database /var/lib/fence-estimator/fence-estimator.db
```

## Restore Drill

Before calling the system production-ready, perform at least one documented drill:

1. Take a backup from a non-trivial database.
2. Restore it into a fresh database path.
3. Start the API against that restored database.
4. Verify login, drawing load, version history, and audit log access.
