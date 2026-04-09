# @evryg/integresql

[![npm version](https://img.shields.io/npm/v/%40evryg/integresql)](https://www.npmjs.com/package/@evryg/integresql)
[![license](https://img.shields.io/npm/l/%40evryg/integresql)](https://github.com/evryg-org/effect-contrib/blob/main/LICENSE)
[![CI](https://github.com/evryg-org/effect-contrib/actions/workflows/check.yml/badge.svg)](https://github.com/evryg-org/effect-contrib/actions/workflows/check.yml)


Effect-ts wrapper around [IntegreSQL](https://github.com/allaboutapps/integresql) — instant isolated PostgreSQL databases for integration tests.

## Installation

```bash
npm install --dev @evryg/integresql
```

## Prerequisites

You need a running IntegreSQL server connected to PostgreSQL.

This package is only the client. It does not start IntegreSQL for you. For setup, see the official IntegreSQL docs: <https://github.com/allaboutapps/integresql#install>

## Quick Start

```ts
import { PgClient } from "@effect/sql-pg"
import { Effect, pipe, Redacted } from "effect"
import { getConnection, templateIdFromFiles, type DatabaseConfiguration } from "@evryg/integresql"

const makePgLayer = (databaseConfiguration: DatabaseConfiguration) =>
  PgClient.layer({
    host: "127.0.0.1",
    port: databaseConfiguration.port,
    username: databaseConfiguration.username,
    password: Redacted.make(databaseConfiguration.password),
    database: databaseConfiguration.database
  })

const program = getConnection({
  integreSQLAPIUrl: "http://127.0.0.1:5000",
  templateId: templateIdFromFiles(["src/db/migrations/*.sql"]),
  initializeTemplate: (connection) =>
    pipe(
      Effect.gen(function*() {
        const sql = yield* PgClient.PgClient
        yield* sql`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`
      }),
      Effect.provide(makePgLayer(connection))
    )
})
```

`getConnection(...)` returns the connection details for a fresh isolated database cloned from the template.

## Recommended Setup: Vitest + Testcontainers

One minimal setup using Vitest, Testcontainers, and `@effect/sql-pg` looks like this:

`vitest.config.ts`

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globalSetup: ["./globalSetup.ts"],
    watch: false
  }
})
```

`globalSetup.ts`

```ts
import type { TestProject } from "vitest/node"
import { startContainers } from "./startContainers.js"

export default async function setup(project: TestProject) {
  const resources = await startContainers()

  project.provide("containers", resources.config)

  return () => resources.teardown()
}
```

`example.test.ts`

```ts
import { PgClient } from "@effect/sql-pg"
import { describe, expect, it } from "@effect/vitest"
import { Effect, pipe } from "effect"
import { inject } from "vitest"
import { getConnection, templateIdFromFiles } from "@evryg/integresql"
import { makePgLayer } from "./makePgLayer.js"

describe(`vitest + testcontainers`, () => {
  it.effect(
    `creates isolated databases from a reusable template`,
    () =>
      Effect.gen(function*() {
        const containers = inject("containers")

        const databaseConfiguration = yield* getConnection({
          templateId: templateIdFromFiles(["./schema.sql"]),
          initializeTemplate: (connection) =>
            pipe(
              Effect.gen(function*() {
                const sql = yield* PgClient.PgClient
                yield* sql`CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`
              }),
              Effect.provide(makePgLayer(connection))
            ),
          integreSQLAPIUrl: containers.integreAPIUrl
        })

        yield* pipe(
          Effect.gen(function*() {
            const sql = yield* PgClient.PgClient
            yield* sql`INSERT INTO users ${sql.insert({ name: "Ada" })}`
            const rows = yield* sql`SELECT * FROM users`
            expect(rows).toStrictEqual([{ id: expect.any(Number), name: "Ada" }])
          }),
          Effect.provide(makePgLayer(databaseConfiguration))
        )
      })
  )
})
```

## Choosing a Template ID

`templateId` identifies the template database to reuse.

In most projects, the right default is:

```ts
templateIdFromFiles(["src/db/migrations/*.sql"])
```

That makes the template change automatically when your schema or migration files change.
