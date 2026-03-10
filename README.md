# Fence Estimator

Production-grade monorepo for a 2D fence layout editor, deterministic estimate engine, and authenticated drawing persistence.

## Workspace

- `apps/web`: React + Konva drawing editor with live estimation.
- `apps/api`: Fastify API for estimates, company/user auth, and persisted drawings.
- `packages/contracts`: Shared domain contracts.
- `packages/geometry`: Pure geometry utilities.
- `packages/rules-engine`: Deterministic fence counting rules.

## Quick Start

1. Use Node 20+ (24 LTS recommended for production). The current local machine is on Node 18 and should be upgraded before running.
2. Install dependencies: `npm ci`
3. Run web app: `npm run dev:web`
4. Run API app: `npm run dev:api`
5. Run checks: `npm run lint && npm run typecheck && npm run test`
6. Run coverage gate: `npm run test:coverage`

## API Runtime Configuration

- `HOST`: bind host for the API process. Default `127.0.0.1`.
- `PORT`: bind port for the API process. Default `3001`.
- `DATABASE_PATH`: SQLite database path for companies, users, sessions, and drawings.
- `ALLOWED_ORIGINS`: comma-separated browser origins allowed by CORS. Defaults to local Vite hosts only.
- `BODY_LIMIT_BYTES`: maximum accepted request body size. Default `262144`.
- `WRITE_RATE_LIMIT_WINDOW_MS`: write rate limit window. Default `60000`.
- `WRITE_RATE_LIMIT_MAX_REQUESTS`: max write requests per IP inside the active window. Default `120`.
- `SESSION_TTL_DAYS`: bearer session lifetime. Default `30`.

## Web Runtime Configuration

- `VITE_API_BASE_URL`: optional absolute API origin for deployed environments. Leave unset in local development to use the built-in `/api` proxy to `http://127.0.0.1:3001`.

## Current Product Capabilities

- Company-scoped account registration and login.
- Bearer-session restore in the web app.
- Saved drawing library per company.
- Load, edit, and update persisted drawings.
- Gate placements are now part of the saved drawing model and server-side estimate calculation.

## Current Scope

- Draw arbitrary fence layouts (including incomplete paths).
- Live counts for:
  - posts
  - corners (internal/external where determinable)
  - Twin Bar panels
  - Roll Form mesh rolls

## Domain Defaults Implemented

- Twin Bar panel width: `2515mm`
- Roll length: `25000mm`
- Roll Form bay width (temporary default): `2515mm`
- Roll Form 2m: `2100mm`
- Roll Form 3m: `2100mm + 900mm` stacked

These defaults are versioned in code and can be expanded per catalogue rules.

## Implemented Interaction Model

- Left click to start/commit segments.
- Right click to cancel active chain.
- 5 degree snap while drawing (hold Shift to disable).
- Pointer-relative wheel zoom + space/middle-button pan.
- Dynamic grid based on zoom scale.
- Per-segment length labels and live ghost length.
- Segment selection, move, endpoint drag, and delete.
- Live posts/corners/panels/roll counts while editing.

## Known Production Gaps

- SQLite is now the real persistence layer, but there are no versioned SQL migrations yet.
- Auth is session-token based and company-aware, but there is no invitation flow, password reset, or per-user authorization policy beyond role fields.
- Drawings persist segments and gates; other future editor state should be treated as schema-managed data, not ad hoc client state.
- The web bundle is still too large and needs code-splitting before serious production traffic.
