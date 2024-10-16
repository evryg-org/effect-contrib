import { PgClient } from "@effect/sql-pg"
import { describe, expect, it } from "@effect/vitest"
import { Effect, pipe } from "effect"
import { inject } from "vitest"
import { getConnection, templateIdFromFiles } from "@evryg/integresql"
import { makePgLayer } from "./makePgLayer.js"

describe(`vitest-testcontainers example`, () => {
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
