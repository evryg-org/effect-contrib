import { NodeContext } from "@effect/platform-node"
import { PgClient } from "@effect/sql-pg"
import { describe, expect, it } from "@effect/vitest"
import { Effect, pipe, Redacted } from "effect"
import { inject } from "vitest"
import type { DatabaseConfiguration } from "../src/index.js"
import { getConnection } from "../src/index.js"
import { templateIdFromFiles } from "../src/templateIdFromFilesHash.js"
import { Sandbox } from "./Sandbox.js"

const dependencies = NodeContext.layer

describe(`examples`, () => {
  it.scoped(
    `getConnection with initializeTemplate and PgClient.layer`,
    () =>
      pipe(
        Effect.gen(function*() {
          const sandbox = yield* Sandbox
          yield* sandbox.writeFile(
            "migration.sql",
            `CREATE TABLE example_table (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`
          )
          const containers = inject("containers")

          const databaseConfiguration = yield* getConnection({
            // Generate a hash depending on the content of your sql files.
            // Any change in any file will generate a new template id,
            // ensuring your tests are always relying on an up to date
            // database preset
            templateId: templateIdFromFiles(
              ["**/*.sql"],
              sandbox.root
            ),
            // Creating our database preset. When you require this template id,
            // you get this preset (tables/views/fixtures/whatever)
            initializeTemplate: (connection) =>
              pipe(
                Effect.gen(function*() {
                  const sql = yield* PgClient.PgClient
                  const migration = yield* sandbox.readFile("migration.sql")
                  yield* sql.unsafe(migration)
                }),
                Effect.provide(makePgLayer(connection))
              ),
            integreSQLAPIUrl: containers.integreAPIUrl
          })

          yield* pipe(
            Effect.gen(function*() {
              const sql = yield* PgClient.PgClient
              yield* sql`INSERT INTO example_table ${sql.insert({ name: "world" })}`
              const rows = yield* sql`SELECT * FROM example_table`
              expect(rows).toStrictEqual([{ id: expect.any(Number), name: "world" }])
            }),
            Effect.provide(makePgLayer(databaseConfiguration))
          )
        }),
        Effect.provide(dependencies)
      )
  )
})

const makePgLayer = (databaseConfiguration: DatabaseConfiguration) =>
  PgClient.layer({
    host: "127.0.0.1",
    port: databaseConfiguration.port,
    username: databaseConfiguration.username,
    password: Redacted.make(databaseConfiguration.password),
    database: databaseConfiguration.database
})
