# Contributing

## Standards

- Keep domain logic pure and deterministic.
- Add tests for any new rule or topology behavior.
- Keep API payloads aligned with `@fence-estimator/contracts`.
- Treat auth, company isolation, and drawing persistence as security-sensitive changes.
- Prefer migrations and backwards-compatible API changes over ad hoc data rewrites.

## Local Workflow

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run test:coverage`
6. `npm run build`
7. Exercise the web app against the API before merging auth, persistence, or data-model changes.

## PR Expectations

- Explain behavior change and domain impact.
- Include/update tests for rule changes.
- Note any assumptions introduced.
- Call out persistence, auth, or data-model changes explicitly.
- Document any new environment variables, API routes, or coverage exclusions.
- Prefer integration or end-to-end tests for orchestration layers over shallow rendering checks.
