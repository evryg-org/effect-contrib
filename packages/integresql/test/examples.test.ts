import { PgClient } from "@effect/sql-pg"
import { describe, expect, it } from "@effect/vitest"
import { Effect, pipe, Redacted } from "effect"
import { getConnection } from "../src/index.js"
import { startContainers } from "./startContainers.js"

describe(`examples`, () => {
  it.effect(
    `getConnection with initializeTemplate and PgClient.layer`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers

          const databaseConfiguration = yield* getConnection({
            databaseFiles: ["packages/integresql/src/**/*.ts"],
            initializeTemplate: (connection) =>
              Effect.gen(function*() {
                const sql = yield* PgClient.PgClient
                yield* sql`CREATE TABLE example_table (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`
              }).pipe(
                Effect.provide(PgClient.layer({
                  host: "127.0.0.1",
                  port: containers.postgres.port,
                  username: connection.username,
                  password: Redacted.make(connection.password),
                  database: connection.database
                })),
                Effect.orDie
              ),
            connection: {
              port: containers.integreSQL.port,
              host: containers.integreSQL.host
            }
          })

          yield* Effect.gen(function*() {
            const sql = yield* PgClient.PgClient
            yield* sql`INSERT INTO example_table ${sql.insert({ name: "world" })}`
            const rows = yield* sql`SELECT * FROM example_table`
            expect(rows).toStrictEqual([{ id: expect.any(Number), name: "world" }])
          }).pipe(
            Effect.provide(PgClient.layer({
              host: "127.0.0.1",
              port: containers.postgres.port,
              username: databaseConfiguration.username,
              password: Redacted.make(databaseConfiguration.password),
              database: databaseConfiguration.database
            }))
          )
        }),
        Effect.scoped
      ),
    1000 * 50
  )
})
