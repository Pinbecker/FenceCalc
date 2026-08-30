# Commercial lifecycle

This document records the Phase 1 domain boundaries used by the application. These boundaries are product rules, not merely portal labels.

## Ownership model

```text
Company
└── Customer account
    └── Site
        └── Project / opportunity
            ├── Design
            │   └── Immutable design revisions
            ├── Estimate
            │   └── Immutable estimate versions
            └── Quote
                └── Immutable quote versions
```

- A **customer** is the organisation or person being quoted.
- A **site** is a physical work location belonging to a customer. One customer can have many sites.
- A **project** is the commercial umbrella for one opportunity at one site. Shared site costs belong at this level in the commercial engine.
- A **design** is one independently revised layout area within a project. The underlying API retains the historical `drawing` name for compatibility.
- An **estimate version** selects one or more exact design revision IDs. A later design revision never changes an existing estimate version.
- A **quote version** selects one exact approved estimate version ID.

## Status ownership

### Project

`ENQUIRY → SURVEY → ESTIMATING → QUOTED → WON`

`LOST` and `ON_HOLD` are manual side states. The system, rather than a manual dropdown, moves a project to `QUOTED` when a quote is issued and to `WON` when that quote is accepted.

### Design

- `WORKING`: the current revision can be edited.
- `READY`: the current revision is locked and can pass estimate review.
- `SUPERSEDED`: reserved for lifecycle-controlled replacement.

Starting a new revision forks the current layout, returns the design to `WORKING`, and leaves every earlier revision read-only.

### Estimate version

`DRAFT → IN_REVIEW → APPROVED`

- Only the current draft can change its selected revisions or notes.
- Review requires every selected revision to be the current revision of a `READY` design.
- An approved version is immutable.
- Starting a new version preserves the approved version in history and marks it `SUPERSEDED`.

### Quote version

`DRAFT → ISSUED → ACCEPTED | REJECTED | EXPIRED`

- Only the current draft can change customer-facing details.
- Issue requires the linked estimate version to remain the current approved estimate.
- Issued and decided versions are immutable.
- An accepted quote cannot be superseded.

## References and auditability

Project, estimate and quote references are allocated per company and year:

- `P-YYYY-0001`
- `E-YYYY-0001`
- `Q-YYYY-0001`

Lifecycle creation, edits, status transitions, version creation and archival are written to the company audit log.

## Commercial calculation

Phase 2 implements the quantity, pricing, margin and quote-presentation boundary described in this document. See `commercial-engine.md` for the calculation ownership model and immutable snapshot rules.
