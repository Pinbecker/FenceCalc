# Commercial estimating engine

Phase 2 turns the lifecycle records defined in `commercial-lifecycle.md` into immutable commercial documents.

## Source of truth

- The drawing canvas owns geometry and product choices.
- A company pricing workbook owns reusable material, labour and commercial rules.
- A published company configuration owns the versioned catalogue and typed assemblies that compile into that workbook.
- An estimate draft owns project-specific manual quantities, ancillary items and permitted overrides.
- A calculated estimate version stores the complete resolved workbook, selected design revision IDs, warnings and totals.
- A quote version stores a separate customer-facing presentation snapshot. It never reads live pricing after creation.

This division prevents catalogue changes, later design revisions or quote-layout changes from rewriting approved history.

## Multi-design calculation

Every selected immutable design revision contributes quantities to one project calculation. Quantities are combined before commercial rules run, so shared charges such as distribution, travel and site attendance are applied once per estimate rather than once per design.

## Company configuration

Administrators can configure:

- material and installation rates generated from drawing quantities;
- material markup, labour markup and labour overhead percentages;
- labour-day value, per-day selling addition and travel/lodge rate;
- shared distribution, concrete, hard-dig and spoil-clearance rates;
- VAT and default quote detail level;
- custom manual calculation blocks; and
- custom items driven by an existing drawing quantity source.

Pricing edits affect future calculations only. Existing calculated, approved and quoted versions retain their original rate snapshot.

Phase 3 replaces immediate live pricing edits with a draft, example-preview and publish workflow. See `company-configuration.md`.

## Estimate controls

Only the current draft estimate version can be calculated. Changing its selected design revisions clears any previous calculation. Review requires current Ready designs, a stored calculation and a positive total. Approval then makes the entire version immutable.

New estimate versions carry the previous project-specific inputs forward but require a fresh calculation.

## Quote presentation

A quote may show section totals, detailed selling lines or one total. Internal cost splits, overhead and markup labels are not exposed to the customer. Commercial additions are presented as project delivery and attendance. Net, VAT and gross totals are fixed when the quote version is created or edited and lock on issue.

## Database version 4

Schema version 4 adds commercial draft and calculation snapshots to estimate versions and presentation snapshots to quote versions. The version 3 to 4 migration is additive and does not rebuild or discard lifecycle tables.
