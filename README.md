# Fence Estimator

Production-grade monorepo for a 2D fence layout editor and deterministic estimate engine.

## Workspace

- `apps/web`: React + Konva drawing editor with live estimation.
- `apps/api`: Fastify API scaffold for persistence and estimate snapshots.
- `packages/contracts`: Shared domain contracts.
- `packages/geometry`: Pure geometry utilities.
- `packages/rules-engine`: Deterministic fence counting rules.

## Quick Start

1. Use Node 20+ (24 LTS recommended for production). The current local machine is on Node 18 and should be upgraded before running.
2. Install dependencies: `npm install`
3. Run web app: `npm run dev:web`
4. Run API app: `npm run dev:api`
5. Run checks: `npm run lint && npm run typecheck && npm run test`

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
