import { PgClient } from "@effect/sql-pg"
import { describe, expect, it, vi } from "@effect/vitest"
import { Effect, Exit, pipe, Redacted } from "effect"
import crypto, { randomUUID } from "node:crypto"
import path from "node:path"
import type { DatabaseTemplateId } from "../src/index.js"
import { _getConnection, createHash, NoMatchingFiles } from "../src/integresql.js"
import type { DatabaseConfiguration } from "../src/IntegreSqlClient.js"
import { IntegrSqlFailedToCreateTemplate, makeIntegreSqlClient } from "../src/IntegreSqlClient.js"
import { startContainers } from "./startContainers.js"

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
    `No database to connect to dies`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers
          const client = makeIntegreSqlClient({
            integrePort: 1234,
            integreHost: containers.integreSQL.host
          })
          const hash = makeRandomHash()

          const result = yield* pipe(
            _getConnection(client)({
              hash,
              initializeTemplate: () => Effect.void
            }),
            Effect.exit
          )

          expect(result).toStrictEqual<typeof result>(Exit.die(expect.any(IntegrSqlFailedToCreateTemplate)))
        }),
        Effect.scoped
      ),
    1000 * 50
  )

  it.effect(
    `Failure during initialize tempate passes on failure`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers
          const client = makeIntegreSqlClient({
            integrePort: containers.integreSQL.port,
            integreHost: containers.integreSQL.host
          })
          const hash = makeRandomHash()

          const result = yield* pipe(
            _getConnection(client)({
              hash,
              initializeTemplate: () => Effect.fail("initialize_template_failure")
            }),
            Effect.exit
          )

          expect(result).toStrictEqual<typeof result>(Exit.fail("initialize_template_failure"))
        }),
        Effect.scoped
      ),
    1000 * 50
  )

  it.effect(
    `Creates a usable template database`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers
          const client = makeIntegreSqlClient({
            integrePort: containers.integreSQL.port,
            integreHost: containers.integreSQL.host
          })
          const hash = makeRandomHash()

          yield* pipe(
            _getConnection(client)({
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
        }),
        Effect.scoped
      ),
    1000 * 50
  )

  it.effect(
    `Template database is only created once`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers
          const client = makeIntegreSqlClient({
            integrePort: containers.integreSQL.port,
            integreHost: containers.integreSQL.host
          })
          const hash = makeRandomHash()
          const initializeTemplateSpy = vi.fn(() => Effect.void)
          const createTemplate = _getConnection(client)({
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
        }),
        Effect.scoped
      ),
    1000 * 50
  )

  it.effect(
    `Returns a new test database every time`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers
          const client = makeIntegreSqlClient({
            integrePort: containers.integreSQL.port,
            integreHost: containers.integreSQL.host
          })
          const getConnection = _getConnection(client)({
            hash: makeRandomHash(),
            initializeTemplate: () => Effect.void
          })

          const result = yield* pipe(
            getConnection,
            Effect.zip(getConnection)
          )

          expect(result[0].database).not.toStrictEqual(result[1].database)
        }),
        Effect.scoped
      ),
    1000 * 50
  )

  it.effect(
    `Different hash, different template`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers
          const client = makeIntegreSqlClient({
            integrePort: containers.integreSQL.port,
            integreHost: containers.integreSQL.host
          })
          const initializeTemplateSpy = vi.fn(() => Effect.void)

          yield* pipe(
            _getConnection(client)({
              hash: makeRandomHash(),
              initializeTemplate: initializeTemplateSpy
            }),
            Effect.zip(
              _getConnection(client)({
                hash: makeRandomHash(),
                initializeTemplate: initializeTemplateSpy
              })
            )
          )

          expect(initializeTemplateSpy).toHaveBeenCalledTimes(2)
        }),
        Effect.scoped
      ),
    1000 * 50
  )
})

const makeRandomHash = () =>
  crypto
    .createHash("sha1")
    .update(randomUUID())
    .digest("hex") as DatabaseTemplateId

const makePgLayer = (postgresPort: number, databaseConfiguration: DatabaseConfiguration) =>
  PgClient.layer({
    host: "127.0.0.1",
    port: postgresPort,
    username: databaseConfiguration.username,
    password: Redacted.make(databaseConfiguration.password),
    database: databaseConfiguration.database
  })
