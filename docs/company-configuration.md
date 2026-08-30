# Company configuration

Phase 3 separates reusable company knowledge from drawing geometry and individual estimates.

## Model

A configuration version contains four controlled layers:

1. **Catalogue items** own a stable code, customer-independent label, cost type, unit and rate.
2. **Assembly rules** connect one catalogue item to either a drawing quantity key or an estimate-time manual quantity.
3. **Typed formula controls** allow a multiplier, minimum, optional numeric condition and explicit rounding increment.
4. **Commercial policy** owns markup, overhead, labour-day, attendance, distribution and VAT defaults.

Assembly rules are data. They cannot contain JavaScript, SQL or arbitrary expressions. This makes drafts validate consistently in the browser, API and deterministic rules engine.

## Draft and publication lifecycle

Each company has exactly one editable draft and at most one live published version.

```text
Published v1 (immutable)  ->  Superseded v1
Draft v2 (editable)       ->  Published v2 (immutable)
                              Draft v3 (editable clone)
```

- Saving updates only the draft.
- A rule preview runs example drawing facts through every assembly and explains the resolved quantities.
- The portal requires the current saved draft to pass preview before enabling Publish. The API reruns that exact example during publication and requires at least one positive drawing fact when drawing-driven rules are enabled.
- Publishing atomically supersedes the previous live version, promotes the draft, updates the live compiled workbook and creates the next draft.
- Published history and configuration audit events are retained.

## Estimate boundary

Every calculation stores the complete compiled price and policy snapshot, as in Phase 2. It now also records the published configuration version ID and number. Later catalogue or assembly changes therefore cannot alter an existing estimate or quote.

## Starting templates

- **Twin Bar starter** clones the complete built-in Twin Bar and sports-feature catalogue into the draft.
- **Blank configuration** retains safe commercial defaults while removing catalogue items and assemblies.

Cloning never changes the live configuration. A cloned draft must still be saved, previewed and published.

## Database version 5

Schema version 5 adds `company_configuration_versions` with partial unique indexes enforcing one draft and one published version per company. The migration from version 4 is additive and does not rebuild product tables.
