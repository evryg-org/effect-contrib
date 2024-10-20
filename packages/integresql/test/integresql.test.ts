import { describe, expect, vi, it } from "@effect/vitest"
import { pipe, Effect, Layer, Deferred, Duration, Exit, Context } from "effect"
import { _getConnection, InitializeTemplate } from "../src/integresql.js"
import crypto, { randomUUID } from "node:crypto"
import {
  DatabaseClient,
  makeLivePostgresDatabaseClient
} from "../src/DatabaseClient.js"

describe(`getConnection`, () => {
  it.effect(
    `No template created for hash initializes template and returns new connection`,
    () =>
      Effect.gen(function* () {
        const hash = makeRandomHash()
        const initializeTemplateSpy = vi.fn(() => Effect.void)

        const result = yield* _getConnection({
          hash,
          initializeTemplate: initializeTemplateSpy
        })

        expect(initializeTemplateSpy).toHaveBeenCalledTimes(1)
        expect(initializeTemplateSpy).toHaveBeenCalledWith<[typeof result]>({
          host: expect.any(String),
          port: expect.any(Number),
          username: expect.any(String),
          password: expect.any(String),
          database: expect.any(String)
        })
        expect(result).toStrictEqual<typeof result>({
          host: expect.any(String),
          port: expect.any(Number),
          username: expect.any(String),
          password: expect.any(String),
          database: expect.any(String)
        })
      })
  )

  it.effect(
    `Template already created for hash returns new connection from template`,
    () =>
      Effect.gen(function* () {
        const hash = makeRandomHash()
        const initializeTemplateSpy = vi.fn(() => Effect.void)

        const result = yield* pipe(
          _getConnection({
            hash,
            initializeTemplate: initializeTemplateSpy
          }),
          Effect.zip(
            _getConnection({
              hash,
              initializeTemplate: initializeTemplateSpy
            })
          )
        )

        expect(initializeTemplateSpy).toHaveBeenCalledTimes(1)
        expect(result[0].database).not.toBe(result[1].database)
      })
  )

  // This always blocks for 2s, find a better way/lever to test this
  it.live(`Trying to get a new DB for a non finalized template blocks`, () =>
    Effect.gen(function* () {
      const hash = makeRandomHash()
      const program2TemplateInitSpy = vi.fn(() => Effect.void)
      const templateInitStartedDeferred = yield* Deferred.make<void>()
      const result = yield* pipe(
        _getConnection({
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
                _getConnection({
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
    })
  )

  it.effect(`Two programs creating the same template in parallel`, () =>
    pipe(
      Effect.gen(function* () {
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
                    port: connection.port,
                    user: connection.username,
                    password: connection.password,
                    database: connection.database
                  },
                  migrations: {
                    directory: "test/knex/migrations"
                  }
                })
              ),
              Effect.scoped
            )
        )
        const LiveTestPostgresDatabaseClient = Layer.unwrapEffect(
          pipe(
            _getConnection({
              hash, // Always use a new hash to be in the "new template" flow
              initializeTemplate
            }),
            Effect.map((_) =>
              makeLivePostgresDatabaseClient({
                connection: {
                  host: "127.0.0.1",
                  port: _.port,
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
    )
  )
})

const makeRandomHash = () =>
  crypto.createHash("sha1").update(randomUUID()).digest("hex")

