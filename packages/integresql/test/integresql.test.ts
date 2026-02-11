import { describe, expect, it, vi } from "@effect/vitest"
import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { Context, Deferred, Duration, Effect, Exit, Layer, pipe } from "effect"
import type { Knex } from "knex"
import knex from "knex"
import crypto, { randomUUID } from "node:crypto"
import path from "node:path"
import { GenericContainer, Network, Wait } from "testcontainers"
import type { DatabaseTemplateId } from "../src/index.js"
import { _getConnection, createHash, NoMatchingFiles } from "../src/integresql.js"
import type { DatabaseConfiguration } from "../src/IntegreSqlClient.js"
import { makeIntegreSqlClient } from "../src/IntegreSqlClient.js"

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
                Effect.promise(async () => {
                  const connection = makeKNEX(containers.postgres.port, databaseConfiguration)
                  await connection.schema.createTable("test_table", (table) => {
                    table.increments("id")
                    table.string("name").notNullable()
                  })
                  await connection.destroy()
                })
            }),
            Effect.flatMap((databaseConfiguration) =>
              Effect.promise(async () => {
                const connection = makeKNEX(containers.postgres.port, databaseConfiguration)
                await connection("test_table").insert({ name: "test_item" })
                const rows = await connection("test_table").select("*")
                expect(rows).toStrictEqual([{ id: expect.any(Number), name: "test_item" }])
                await connection.destroy()
              })
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

  // This always blocks for 2s, find a better way/lever to test this
  it.live(
    `Trying to get a new DB for a non finalized template blocks`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers
          const client = makeIntegreSqlClient({
            integrePort: containers.integreSQL.port,
            integreHost: containers.integreSQL.host
          })
          const hash = makeRandomHash()
          const program2TemplateInitSpy = vi.fn(() => Effect.void)
          const templateInitStartedDeferred = yield* Deferred.make<void>()
          const result = yield* pipe(
            _getConnection(client)({
              hash,
              initializeTemplate: () =>
                pipe(
                  templateInitStartedDeferred,
                  Deferred.succeed<void>(undefined),
                  Effect.zipRight(Effect.never)
                )
            }),
            Effect.fork,
            Effect.zipRight(
              pipe(
                templateInitStartedDeferred,
                Effect.zipRight(
                  pipe(
                    _getConnection(client)({
                      hash,
                      initializeTemplate: program2TemplateInitSpy
                    }),
                    Effect.timeoutFail({
                      onTimeout: () => "timeout",
                      duration: Duration.seconds(2)
                    }),
                    Effect.exit
                  )
                )
              )
            )
          )

          expect(program2TemplateInitSpy).not.toHaveBeenCalled()
          expect(result).toStrictEqual(Exit.fail("timeout"))
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

const startContainers = pipe(
  Effect.promise(async () => {
    const network = await new Network().start()
    const postgres = await new PostgreSqlContainer("postgres:12.2-alpine")
      .withNetwork(network)
      .start()
    const integreSQL = await new GenericContainer(
      "ghcr.io/allaboutapps/integresql:v1.1.0"
    )
      .withExposedPorts(5000)
      .withNetwork(network)
      .withEnvironment({
        PGDATABASE: postgres.getDatabase(),
        PGUSER: postgres.getUsername(),
        PGPASSWORD: postgres.getPassword(),
        PGHOST: postgres.getIpAddress(network.getName()),
        PGPORT: "5432", // Use the container port, we are reaching through container network
        PGSSLMODE: "disable"
      })
      .withNetwork(network)
      .withWaitStrategy(Wait.forLogMessage("server started on"))
      .start()

    return {
      integreSQL: {
        port: integreSQL.getFirstMappedPort(),
        host: integreSQL.getHost()
      },
      postgres: {
        port: postgres.getFirstMappedPort(),
        host: postgres.getHost()
      },
      close: Effect.promise(async () => {
        await integreSQL.stop()
        await postgres.stop()
        await network.stop()
      })
    }
  }),
  Effect.acquireRelease((a) => a.close),
  Effect.map(({ close: _, ...a }) => a)
)

class DatabaseClient extends Context.Tag("DatabaseClient")<
  DatabaseClient,
  {
    connection: Knex
    isConnected: Effect.Effect<boolean>
    migrateUp: Effect.Effect<void>
    migrateDown: Effect.Effect<void>
    close: Effect.Effect<void>
  }
>() {}

const makeLivePostgresDatabaseClient = (config: {
  connection: {
    host: string
    port: number
    user: string
    password: string
    database: string
  }
  migrations: {
    directory: string
  }
}) =>
  pipe(
    Effect.sync(() => {
      return knex({
        client: "pg",
        connection: config.connection
      })
    }),
    Effect.map(
      (knex): Context.Tag.Service<DatabaseClient> => ({
        connection: knex,
        isConnected: pipe(
          Effect.promise(() => knex.raw("select 1+1")),
          Effect.as(true),
          Effect.catchAllCause(() => Effect.succeed(false))
        ),
        migrateUp: Effect.promise(() => knex.migrate.up({ directory: config.migrations.directory })),
        migrateDown: Effect.promise(() => knex.migrate.down({ directory: config.migrations.directory })),
        close: Effect.async((cb) => knex.destroy(() => cb(Effect.void)))
      })
    ),
    Effect.tap((client) =>
      pipe(
        client.isConnected,
        Effect.if({
          onTrue: () => Effect.void,
          onFalse: () => Effect.die("Database not connected")
        })
      )
    ),
    Effect.acquireRelease((client) => client.close),
    Layer.effect(DatabaseClient)
  )

const makeKNEX = (postgresPort: number, databaseConfiguration: DatabaseConfiguration) =>
  knex({
    client: "pg",
    connection: {
      host: "127.0.0.1",
      port: postgresPort,
      user: databaseConfiguration.username,
      password: databaseConfiguration.password,
      database: databaseConfiguration.database
    }
  })
