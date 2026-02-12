# ADR 0001: Monorepo and Package Boundaries

- Status: Accepted
- Date: 2026-02-12

## Decision

Use a TypeScript monorepo with application and domain packages separated by responsibility.

## Rationale

- Domain rules must remain UI-framework agnostic.
- API and UI must share typed contracts.
- Workspace builds/tests reduce integration drift.

## Consequences

- Shared packages become critical path and require strict review.
- Versioning strategy needed for deterministic rule snapshots.

