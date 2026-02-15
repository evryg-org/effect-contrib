# @evryg/integresql

[![npm version](https://img.shields.io/npm/v/%40evryg/integresql)](https://www.npmjs.com/package/@evryg/integresql)
[![license](https://img.shields.io/npm/l/%40evryg/integresql)](https://github.com/evryg-org/effect-contrib/blob/main/LICENSE)
[![CI](https://github.com/evryg-org/effect-contrib/actions/workflows/check.yml/badge.svg)](https://github.com/evryg-org/effect-contrib/actions/workflows/check.yml)


Effect-ts wrapper around [IntegreSQL](https://github.com/allaboutapps/integresql) — instant isolated PostgreSQL databases for integration tests.

## Installation

```bash
npm install --dev @evryg/integresql
```

## Usage
TODO: Setup using test containers (ours)
TODO: Setup using docker (link to integresql docs https://github.com/allaboutapps/integresql)
TODO: Usage example for each

## TODOS
[] - Update readme
[] - Fix ci 
[] - Add coderabbit/auto review ? 


## Improvements/next steps
[] - Expose all integresql api endpoints via the client

## Old readme ------------------------------
(old examples, to update or discard)
### Step 1 — Start the infrastructure

Create a `docker-compose.yml` at the root of your project:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: postgres
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      timeout: 5s
      retries: 10

  integresql:
    image: ghcr.io/allaboutapps/integresql:v1.1.0
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      INTEGRESQL_PGHOST: postgres
      INTEGRESQL_PGUSER: postgres
      INTEGRESQL_PGPASSWORD: postgres
    ports:
      - "5000:5000"
```

```bash
docker compose up -d
```

### Step 2 — Create a test helper

```ts
// test/get-test-db.ts
import { getConnection, templateIdFromFiles, type DatabaseConfiguration } from "@evryg/integresql"
import { PgClient } from "@effect/sql-pg"
import { Effect, Redacted } from "effect"

// Returns an Effect that yields a fresh DatabaseConfiguration per call
export const getTestDatabase = getConnection({
  // An Effect that resolves to a template ID string.
  // templateIdFromFiles hashes the matched files — when they change, a new template is created.
  templateId: templateIdFromFiles(["src/migrations/**/*.sql"]),

  // Called once per unique hash to initialize the template database.
  initializeTemplate: (connection) =>
    Effect.gen(function* () {
      const sql = yield* PgClient.PgClient
      yield* sql`CREATE TABLE users (
        id   SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      )`
    }).pipe(
      Effect.provide(pgClientLayer(connection)),
      Effect.orDie
    ),
})

// Helper to build a PgClient layer from a DatabaseConfiguration
export const pgClientLayer = (connection: DatabaseConfiguration) =>
  PgClient.layer({
    host: connection.host,
    port: connection.port,
    username: connection.username,
    password: Redacted.make(connection.password),
    database: connection.database,
  })
```

### Step 3 — Use in tests

```ts
// test/users.test.ts
import { PgClient } from "@effect/sql-pg"
import { Effect } from "effect"
import { getTestDatabase, pgClientLayer } from "./get-test-db.js"
import { expect, test } from "vitest"

// Small helper: grab a fresh DB, build a PgClient layer, run the effect
const runWithDb = <A>(effect: Effect.Effect<A, never, PgClient.PgClient>) =>
  Effect.gen(function* () {
    const connection = yield* getTestDatabase
    return yield* Effect.provide(effect, pgClientLayer(connection))
  }).pipe(Effect.runPromise)

test("can insert and query", () =>
  runWithDb(
    Effect.gen(function* () {
      const sql = yield* PgClient.PgClient
      yield* sql`INSERT INTO users (name) VALUES ('Alice')`
      const rows = yield* sql`SELECT name FROM users`
      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe("Alice")
    })
  ))

test("each test gets an empty database", () =>
  runWithDb(
    Effect.gen(function* () {
      const sql = yield* PgClient.PgClient
      const rows = yield* sql`SELECT * FROM users`
      expect(rows).toHaveLength(0) // no data from the other test
    })
  ))
```

## Examples

### Seed data in the template

If every test needs reference data, insert it in `initializeTemplate`. Every cloned database will start with those rows:

```ts
export const getTestDatabase = getConnection({
  templateId: templateIdFromFiles(["src/migrations/**/*.sql"]),
  initializeTemplate: (connection) =>
    Effect.gen(function* () {
      const sql = yield* PgClient.PgClient
      yield* sql`CREATE TABLE roles (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`
      yield* sql`INSERT INTO roles (name) VALUES ('admin'), ('member')`
    }).pipe(
      Effect.provide(pgClientLayer(connection)),
      Effect.orDie
    ),
})
```

### Sharing a template across test files

The template is identified by the `templateId`. If two test files use the same `templateId`, they share the same template — initialization runs only once. Export a single helper and import it everywhere:

```ts
// test/get-test-db.ts  — shared across all test files
export const getTestDatabase = getConnection({ /* ... */ })

// test/users.test.ts
import { getTestDatabase } from "./get-test-db.js"

// test/orders.test.ts
import { getTestDatabase } from "./get-test-db.js"
```

### Custom IntegreSQL connection

By default the library connects to IntegreSQL at `localhost:5000`. Override with the `connection` option:

```ts
export const getTestDatabase = getConnection({
  templateId: templateIdFromFiles(["src/migrations/**/*.sql"]),
  initializeTemplate: (connection) => /* ... */,
  connection: { host: "integresql.local", port: 8080 },
})
```

## API

### `getConnection(config)`

```ts
getConnection<E1, E2, R1, R2>(config: {
  templateId: Effect.Effect<string, E1, R1>
  initializeTemplate: (connection: DatabaseConfiguration) => Effect.Effect<void, E2, R2>
  connection?: { host: string; port: number }
}): Effect.Effect<DatabaseConfiguration, E1 | E2, R1 | R2>
```

Returns an `Effect` that, when run, yields a `DatabaseConfiguration` pointing to a fresh isolated database.

| Parameter              | Description                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `templateId`           | An `Effect` that resolves to a template ID string. Use `templateIdFromFiles` to compute one from file hashes. |
| `initializeTemplate`   | Runs once per unique template ID. Use it to apply migrations, create tables, or insert seed data.    |
| `connection`           | Optional. IntegreSQL server address. Defaults to `{ host: "localhost", port: 5000 }`.                |

### `templateIdFromFiles(patterns)`

```ts
templateIdFromFiles(
  patterns: [string, ...Array<string>]
): Effect.Effect<DatabaseTemplateId, NoMatchingFiles>
```

> `DatabaseTemplateId` is a branded `string` — it is accepted directly by `getConnection` via the `templateId` parameter.

Hashes the contents of files matching the given glob patterns to produce a stable template ID. When file contents change, a new template ID is generated, causing `getConnection` to create a new template.

| Parameter   | Description                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| `patterns`  | One or more glob patterns. File contents are hashed to identify the template. |

### `DatabaseConfiguration`

Returned by `getConnection`. Contains everything you need to connect to the test database:

```ts
class DatabaseConfiguration {
  host: string
  port: number
  username: string
  password: string
  database: string
}
```

## License

MIT
