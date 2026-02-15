import { PgClient } from "@effect/sql-pg"
import { describe, expect, it, vi } from "@effect/vitest"
import { Effect, Exit, pipe, Redacted } from "effect"
import { randomUUID } from "node:crypto"
import { inject } from "vitest"
import { getConnection } from "../src/getConnection.js"
import type { DatabaseConfiguration } from "../src/IntegreSqlClient.js"

describe(`getConnection`, () => {
  it.effect(
    `Failure during initialize template passes on failure`,
    () =>
      Effect.gen(function*() {
        const containers = inject("containers")

        const result = yield* pipe(
          getConnection({
            templateId: randomTemplateId,
            initializeTemplate: () => Effect.fail("initialize_template_failure"),
            integreSQLAPIUrl: containers.integreAPIUrl
          }),
          Effect.exit
        )

        expect(result).toStrictEqual<typeof result>(Exit.fail("initialize_template_failure"))
      })
  )

  it.effect(
    `Creates a usable template database`,
    () =>
      Effect.gen(function*() {
        const containers = inject("containers")
        const connection = yield* getConnection({
          templateId: randomTemplateId,
          initializeTemplate: (databaseConfiguration) =>
            pipe(
              Effect.gen(function*() {
                const sql = yield* PgClient.PgClient
                yield* sql`CREATE TABLE test_table (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`
              }),
              Effect.provide(makePgLayer(databaseConfiguration))
            ),
          integreSQLAPIUrl: containers.integreAPIUrl
        })

        const result = yield* pipe(
          Effect.gen(function*() {
            const sql = yield* PgClient.PgClient
            yield* sql`INSERT INTO test_table ${sql.insert({ name: "test_item" })}`
            return yield* sql`SELECT * FROM test_table`
          }),
          Effect.provide(makePgLayer(connection))
        )

        expect(result).toStrictEqual([{ id: expect.any(Number), name: "test_item" }])
      })
  )

  it.effect(
    `Template database is only created once`,
    () =>
      Effect.gen(function*() {
        const containers = inject("containers")
        const initializeTemplateSpy = vi.fn(() => Effect.void)
        const templateId = Effect.succeed(randomUUID())
        const createTemplate = getConnection({
          templateId,
          initializeTemplate: initializeTemplateSpy,
          integreSQLAPIUrl: containers.integreAPIUrl
        })

        yield* Effect.all([
          createTemplate,
          createTemplate,
          createTemplate
        ], { concurrency: "unbounded" })

        expect(initializeTemplateSpy).toHaveBeenCalledTimes(1)
      })
  )

  it.effect(
    `Returns a new test database every time`,
    () =>
      Effect.gen(function*() {
        const containers = inject("containers")
        const templateId = Effect.succeed(randomUUID())
        const connection = getConnection({
          templateId,
          initializeTemplate: () => Effect.void,
          integreSQLAPIUrl: containers.integreAPIUrl
        })

        const result = yield* pipe(
          connection,
          Effect.zip(connection)
        )

        expect(result[0].database).not.toStrictEqual(result[1].database)
      })
  )

  it.effect(
    `Different template id, different template`,
    () =>
      Effect.gen(function*() {
        const containers = inject("containers")
        const initializeTemplateSpy = vi.fn(() => Effect.void)
        const makeGetConnection = (templateId: Effect.Effect<string>) =>
          getConnection({
            templateId,
            initializeTemplate: initializeTemplateSpy,
            integreSQLAPIUrl: containers.integreAPIUrl
          })

        yield* pipe(
          makeGetConnection(randomTemplateId),
          Effect.zip(makeGetConnection(randomTemplateId))
        )

        expect(initializeTemplateSpy).toHaveBeenCalledTimes(2)
      })
  )
})

const randomTemplateId = Effect.sync(() => randomUUID())

const makePgLayer = (databaseConfiguration: DatabaseConfiguration) =>
  PgClient.layer({
    host: "127.0.0.1",
    port: databaseConfiguration.port,
    username: databaseConfiguration.username,
    password: Redacted.make(databaseConfiguration.password),
    database: databaseConfiguration.database
  })
