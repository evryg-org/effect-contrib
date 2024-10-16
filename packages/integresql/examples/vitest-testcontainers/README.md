# Vitest + Testcontainers Example

This example shows one working setup for using `@evryg/integresql` with Vitest, Testcontainers, and `@effect/sql-pg`.

Inside this repository, the example depends on the current local build via:

```json
"@evryg/integresql": "file:../../dist"
```

If you copy this example into another project, replace that dependency with the published package version.

## Run it

```bash
pnpm install --ignore-workspace
pnpm check
pnpm test
```
