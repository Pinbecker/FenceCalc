# Editor Integrity and Panel Cut Plan

Phase 4 establishes one geometry policy for every drawing entry point and replaces the experimental
three-dimensional planner with a production-oriented two-dimensional cutting sheet.

## Drawing integrity

The shared `@fence-estimator/geometry` package owns the drawing invariants. The editor uses these
rules while placing items and before saving; the API applies the same rules before creating or
updating a revision. Invalid API writes return HTTP 422 with an `integrityIssues` array and do not
alter the stored revision.

The current invariants reject:

- fence lines shorter than 50mm or duplicate segment identifiers;
- fence lines that cross, form an unsplit T-junction, or overlap on the same axis;
- gates attached to missing fence lines;
- gates narrower than 50mm, outside their fence line, or within 50mm of an endpoint;
- gates that overlap another gate on the same fence line.

Shared endpoints are valid junctions. The editor's drawing clamp, segment-intersection logic, gate
placement clamp, save warning, and server validation all call the shared implementation.

## Panel Cut Plan

The Panel Cut Plan presents each required stock panel as a scaled horizontal cutting bar. It shows:

- the exact cut sequence and source fence line;
- the segment offsets and lift represented by each piece;
- the controlled 200mm offcut-reuse allowance between chained cuts;
- remaining and reusable offcuts;
- stock utilization and panels saved for every height and variant group.

The view is intentionally two-dimensional. It is a cutting instruction for production staff rather
than a decorative model of the completed fence. It can be printed directly from the modal.

## Verification contract

Generated tests exercise crossing classification under segment-order and direction changes, and
exercise stock accounting over randomized layouts. API lifecycle coverage proves that an invalid
save is rejected without changing the persisted revision.
