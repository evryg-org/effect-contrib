import { PgClient } from "@effect/sql-pg"
import { describe, expect, it, vi } from "@effect/vitest"
import { Effect, Exit, pipe, Redacted } from "effect"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { inject } from "vitest"
import { makeGetConnection, createHash, NoMatchingFiles } from "../src/getConnection.js"
import type { DatabaseConfiguration } from "../src/IntegreSqlClient.js"
import { makeIntegreSqlClient, unsafeMakeDatabaseTemplateId } from "../src/IntegreSqlClient.js"

describe.skip(`createHash`, () => {
  it.effect(`File not found fails`, () =>
    pipe(
      Effect.gen(function*() {
        const result = yield* pipe(
          createHash(["packages/integresql/non_existing_folder/**/*.ts"]),
          Effect.exit
        )

        expect(result).toStrictEqual<typeof result>(
          Exit.fail(
            new NoMatchingFiles([
              path.join(
                process.cwd(),
                "packages/integresql/non_existing_folder/**/*.ts"
              )
            ])
          )
        )
      })
    ))
})

describe(`getConnection`, () => {
  it.effect(
    `Failure during initialize tempate passes on failure`,
    () =>
      Effect.gen(function*() {
        const containers = inject("containers")
        const client = makeIntegreSqlClient({
          integrePort: containers.integreSQL.port,
          integreHost: containers.integreSQL.host
        })
        const hash = makeRandomHash()

        const result = yield* pipe(
          makeGetConnection(client)({
            hash,
            initializeTemplate: () => Effect.fail("initialize_template_failure")
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
        const client = makeIntegreSqlClient({
          integrePort: containers.integreSQL.port,
          integreHost: containers.integreSQL.host
        })
        const hash = makeRandomHash()

        yield* pipe(
          makeGetConnection(client)({
            hash,
            initializeTemplate: (databaseConfiguration) =>
              Effect.gen(function*() {
                const sql = yield* PgClient.PgClient
                yield* sql`CREATE TABLE test_table (id SERIAL PRIMARY KEY, name TEXT NOT NULL)`
              }).pipe(
                Effect.provide(makePgLayer(containers.postgres.port, databaseConfiguration)),
                Effect.orDie
              )
          }),
          Effect.flatMap((databaseConfiguration) =>
            Effect.gen(function*() {
              const sql = yield* PgClient.PgClient
              yield* sql`INSERT INTO test_table ${sql.insert({ name: "test_item" })}`
              const rows = yield* sql`SELECT * FROM test_table`
              expect(rows).toStrictEqual([{ id: expect.any(Number), name: "test_item" }])
            }).pipe(
              Effect.provide(makePgLayer(containers.postgres.port, databaseConfiguration)),
              Effect.orDie
            )
          )
        )
      })
  )

  it.effect(
    `Template database is only created once`,
    () =>
      Effect.gen(function*() {
        const containers = inject("containers")
        const client = makeIntegreSqlClient({
          integrePort: containers.integreSQL.port,
          integreHost: containers.integreSQL.host
        })
        const hash = makeRandomHash()
        const initializeTemplateSpy = vi.fn(() => Effect.void)
        const createTemplate = makeGetConnection(client)({
          hash,
          initializeTemplate: initializeTemplateSpy
        })

        yield* Effect.all([
          createTemplate,
          createTemplate,
          createTemplate,
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
        const client = makeIntegreSqlClient({
          integrePort: containers.integreSQL.port,
          integreHost: containers.integreSQL.host
        })
        const getConnection = makeGetConnection(client)({
          hash: makeRandomHash(),
          initializeTemplate: () => Effect.void
        })

        const result = yield* pipe(
          getConnection,
          Effect.zip(getConnection)
        )

        expect(result[0].database).not.toStrictEqual(result[1].database)
      })
  )

  it.effect(
    `Different hash, different template`,
    () =>
      Effect.gen(function*() {
        const containers = inject("containers")
        const client = makeIntegreSqlClient({
          integrePort: containers.integreSQL.port,
          integreHost: containers.integreSQL.host
        })
        const initializeTemplateSpy = vi.fn(() => Effect.void)

        yield* pipe(
          makeGetConnection(client)({
            hash: makeRandomHash(),
            initializeTemplate: initializeTemplateSpy
          }),
          Effect.zip(
            makeGetConnection(client)({
              hash: makeRandomHash(),
              initializeTemplate: initializeTemplateSpy
            })
          )
        )

        expect(initializeTemplateSpy).toHaveBeenCalledTimes(2)
      })
  )
})

const makeRandomHash = () => unsafeMakeDatabaseTemplateId(randomUUID())

const makePgLayer = (postgresPort: number, databaseConfiguration: DatabaseConfiguration) =>
  PgClient.layer({
    host: "127.0.0.1",
    port: postgresPort,
    username: databaseConfiguration.username,
    password: Redacted.make(databaseConfiguration.password),
    database: databaseConfiguration.database
  })
