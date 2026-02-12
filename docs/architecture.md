# Architecture

## Scope

Fence Estimator is a deterministic 2D layout and estimate platform. Layout geometry is user-authored in the web client and material/post counts are produced by a versioned rules engine.

## Monorepo

- `apps/web`: primary drawing experience and live counts.
- `apps/api`: HTTP API for estimates and snapshot persistence.
- `packages/contracts`: shared type + schema contracts.
- `packages/geometry`: pure geometry/snap math.
- `packages/rules-engine`: deterministic counting logic.

## Runtime Flow

1. User draws/edits layout segments in `apps/web`.
2. `packages/rules-engine` computes live estimate directly in-browser.
3. Optional snapshot save posts layout to API.
4. API re-runs deterministic estimate and stores immutable snapshot payload.

## Rules Engine Principles

- Deterministic and side-effect free.
- Integer millimeter domain.
- Versionable constants and catalogue rules.
- Test-first for edge cases (open paths, odd topologies, mixed heights).

## Topology Model

- Segment endpoints map to node keys in mm-space.
- Node degree and vector relationships classify:
  - terminal posts
  - intermediate posts
  - corner candidates
- Closed-loop components are analyzed for internal/external corner classification.

## Production Hardening Path

- Replace in-memory snapshot repository with PostgreSQL.
- Add authentication and tenant boundaries.
- Add OpenTelemetry traces across web and API.
- Add rule-set version pinning to persisted estimates.

