# Testing conventions

Quick reference for writing tests in `packages/integresql`.

## Test runner & config

- **Vitest** with `@effect/vitest` (`describe`, `expect`, `it`, `vi`)
- `vitest.config.ts` merges shared config + adds `globalSetup: ["./test/globalSetup.ts"]`
- Shared config (`vitest.shared.ts`) sets `include: ["test/**/*.test.ts"]` and `sequence.concurrent: true`
- `setupTests.ts` calls `it.addEqualityTesters()` at the root — enables structural equality for Effect types

## File structure

```
test/
  {Module}.test.ts      # one file per module under test
  globalSetup.ts        # container lifecycle (start/teardown)
  startContainers.ts    # testcontainers orchestration
```

## Test shape

```ts
it.effect(
  `X does y`,
  () =>
    Effect.gen(function*() {
      // arrange 

      // act 
      
      // assert
    }),
)
```

- Always use `it.effect()` — not `it()` — for Effect-based tests
- Body is `() => Effect.gen(function*() { ... })`
- Always one line between arrange/act/assert
- No comments unless you have to explain something weird

## Assertions

Use `toStrictEqual` with a type annotation matching the result variable:

```ts
expect(result).toStrictEqual<typeof result>(Exit.void)
```

For non-deterministic fields, use `expect.any(Type)` inside `toStrictEqual` — never fall back to `toBeDefined`, `toBeGreaterThan`, `toBeInstanceOf`, etc:

```ts
expect(result).toStrictEqual<typeof result>(
  Option.some(new DatabaseConfiguration({
    host: expect.any(String),
    port: expect.any(Number),
    username: expect.any(String),
    password: expect.any(String),
    database: expect.any(String)
  }))
)
```

- Never use `as any` in tests

## Error testing

Capture the Exit instead of letting the test throw:

```ts
const result = yield* pipe(
  someEffect,
  Effect.exit
)

expect(result).toStrictEqual<typeof result>(
  Exit.fail(new ExpectedError({ ... }))
)
```

## Helpers
- Co-locate helpers (e.g. `makeRandomHash`, `makePgLayer`) at the bottom of the test file
- Extract to a shared util only when duplicated across 3+ files


## Container infrastructure

```
vitest.config.ts
  └─ globalSetup: ./test/globalSetup.ts
       └─ startContainersRaw()  (from ./test/startContainers.ts)
            ├─ Network
            ├─ PostgreSqlContainer (postgres:12.2-alpine)
            └─ GenericContainer (integresql:v1.1.0)

globalSetup provides:
  project.provide("containers", { integreSQL: { port, host }, postgres: { port, host } })

Tests access via:
  const containers = inject("containers")
```

Teardown (stopping containers + network) runs automatically after the test suite via the returned cleanup function.
