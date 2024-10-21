import { describe, expect, it, vi } from "@effect/vitest"
import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { Context, Deferred, Duration, Effect, Exit, Layer, pipe } from "effect"
import type { Knex } from "knex"
import knex from "knex"
import crypto, { randomUUID } from "node:crypto"
import { GenericContainer, Network, Wait } from "testcontainers"
import type { InitializeTemplate } from "../src/integresql.js"
import { _getConnection } from "../src/integresql.js"
import type { DatabaseTemplateId } from "../src/IntegreSqlClient.js"
import { DatabaseConfiguration, IntegreSqlApiClient } from "../src/IntegreSqlClient.js"

it.effect(
  `No template created for hash initializes template and returns new connection`,
  () =>
    pipe(
      Effect.gen(function*() {
        const containers = yield* startContainers
        const client = new IntegreSqlApiClient({
          integrePort: containers.integreSQL.port,
          integreHost: containers.integreSQL.host
        })
        const hash = makeRandomHash()
        const initializeTemplateSpy = vi.fn(() => Effect.void)

        const result = yield* _getConnection(client)({
          hash,
          initializeTemplate: initializeTemplateSpy
        })

        expect(initializeTemplateSpy).toHaveBeenCalledTimes(1)

        expect(initializeTemplateSpy).toHaveBeenCalledWith<[typeof result]>(
          new DatabaseConfiguration({
            host: expect.any(String),
            port: expect.any(Number),
            username: expect.any(String),
            password: expect.any(String),
            database: expect.any(String)
          })
        )
        expect(result).toStrictEqual<typeof result>(
          new DatabaseConfiguration({
            host: expect.any(String),
            port: expect.any(Number),
            username: expect.any(String),
            password: expect.any(String),
            database: expect.any(String)
          })
        )
      }),
      Effect.scoped
    ),
  1000 * 60
)

describe(`getConnection`, () => {
  it.effect(
    `No template created for hash initializes template and returns new connection`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers
          const client = new IntegreSqlApiClient({
            integrePort: containers.integreSQL.port,
            integreHost: containers.integreSQL.host
          })
          const hash = makeRandomHash()
          const initializeTemplateSpy = vi.fn(() => Effect.void)

          const result = yield* _getConnection(client)({
            hash,
            initializeTemplate: initializeTemplateSpy
          })

          expect(initializeTemplateSpy).toHaveBeenCalledTimes(1)
          expect(initializeTemplateSpy).toHaveBeenCalledWith<[typeof result]>(
            new DatabaseConfiguration({
              host: expect.any(String),
              port: expect.any(Number),
              username: expect.any(String),
              password: expect.any(String),
              database: expect.any(String)
            })
          )
          expect(result).toStrictEqual<typeof result>(
            new DatabaseConfiguration({
              host: expect.any(String),
              port: expect.any(Number),
              username: expect.any(String),
              password: expect.any(String),
              database: expect.any(String)
            })
          )
        }),
        Effect.scoped
      )
  )

  it.effect(
    `Template already created for hash returns new connection from template`,
    () =>
      pipe(
        Effect.gen(function*() {
          const containers = yield* startContainers
          const client = new IntegreSqlApiClient({
            integrePort: containers.integreSQL.port,
            integreHost: containers.integreSQL.host
          })
          const hash = makeRandomHash()
          const initializeTemplateSpy = vi.fn(() => Effect.void)

          const result = yield* pipe(
            _getConnection(client)({
              hash,
              initializeTemplate: initializeTemplateSpy
            }),
            Effect.zip(
              _getConnection(client)({
                hash,
                initializeTemplate: initializeTemplateSpy
              })
            )
          )

          expect(initializeTemplateSpy).toHaveBeenCalledTimes(1)
          expect(result[0].database).not.toBe(result[1].database)
        }),
        Effect.scoped
      )
  )

  // This always blocks for 2s, find a better way/lever to test this
  it.live(`Trying to get a new DB for a non finalized template blocks`, () =>
    pipe(
      Effect.gen(function*() {
        const containers = yield* startContainers
        const client = new IntegreSqlApiClient({
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
    ))

  it.effect(`Two programs creating the same template in parallel`, () =>
    pipe(
      Effect.gen(function*() {
        const containers = yield* startContainers
        const client = new IntegreSqlApiClient({
          integrePort: containers.integreSQL.port,
          integreHost: containers.integreSQL.host
        })
        const hash = makeRandomHash()
        const initializeTemplate: InitializeTemplate<never> = vi.fn(
          (connection) =>
            pipe(
              DatabaseClient,
              Effect.flatMap((client) => client.migrateUp),
              Effect.provide(
                makeLivePostgresDatabaseClient({
                  connection: {
                    host: "127.0.0.1",
                    port: containers.postgres.port,
                    user: connection.username,
                    password: connection.password,
                    database: connection.database
                  },
                  migrations: {
                    directory: "packages/integresql/test/knex/migrations"
                  }
                })
              ),
              Effect.scoped
            )
        )
        const LiveTestPostgresDatabaseClient = Layer.unwrapEffect(
          pipe(
            _getConnection(client)({
              hash, // Always use a new hash to be in the "new template" flow
              initializeTemplate
            }),
            Effect.map((_) =>
              makeLivePostgresDatabaseClient({
                connection: {
                  host: "127.0.0.1",
                  port: containers.postgres.port,
                  user: _.username,
                  password: _.password,
                  database: _.database
                },
                migrations: {
                  directory: "test/knex/migrations"
                }
              })
            )
          )
        )
        const createUser = (username: string) => (client: Context.Tag.Service<DatabaseClient>) =>
          Effect.promise(() =>
            client
              .connection("user")
              .insert({ username }, "*")
              .then(() => undefined)
          )
        const listUsers = (client: Context.Tag.Service<DatabaseClient>) =>
          Effect.promise(() => client.connection("user").select("*"))

        const [programAResult, programBResult] = yield* pipe(
          Effect.all(
            [
              pipe(
                DatabaseClient,
                Effect.tap(createUser("A")),
                Effect.flatMap(listUsers),
                Effect.provide(LiveTestPostgresDatabaseClient)
              ),
              pipe(
                DatabaseClient,
                Effect.tap(createUser("B")),
                Effect.flatMap(listUsers),
                Effect.provide(LiveTestPostgresDatabaseClient)
              )
            ],
            { concurrency: "unbounded" }
          )
        )

        expect(programAResult).toStrictEqual([
          { id: expect.any(Number), username: "A" }
        ])
        expect(programBResult).toStrictEqual([
          { id: expect.any(Number), username: "B" }
        ])
        expect(initializeTemplate).toHaveBeenCalledTimes(1)
      }),
      Effect.scoped
    ))
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
