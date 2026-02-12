# ADR 0002: Deterministic Rules Engine

- Status: Accepted
- Date: 2026-02-12

## Decision

Implement estimation logic as pure functions over integer-mm layout input.

## Rationale

- Quotes must be reproducible and auditable.
- Same inputs must always produce the same outputs.
- Side-effect free logic is testable and safe to run in both UI and API.

## Consequences

- Geometry normalization is mandatory before calculation.
- Rule constants must be explicit and versioned.
- API persistence should store rule version with each snapshot.

