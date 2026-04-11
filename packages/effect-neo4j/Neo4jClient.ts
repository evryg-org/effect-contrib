import neo4j, { type Driver, type QueryResult, type Record as Neo4jRecord, type Session } from "neo4j-driver"
import { Context, Effect, Layer, Schema, Stream } from "effect"
import { Neo4jConfig } from "./Neo4jConfig"

export type { Record as Neo4jRecord } from "neo4j-driver"

// --- Errors ---

export class Neo4jConnectionError extends Schema.TaggedError<Neo4jConnectionError>()("Neo4jConnectionError", {
  uri: Schema.String,
  cause: Schema.Defect,
}) {}

export class Neo4jQueryError extends Schema.TaggedError<Neo4jQueryError>()("Neo4jQueryError", {
  cypher: Schema.String,
  cause: Schema.Defect,
}) {}

export type Neo4jError = Neo4jConnectionError | Neo4jQueryError

// --- Effectful combinators ---

export const makeDriver = (uri: string, user: string, password: string): Effect.Effect<Driver> =>
  Effect.sync(() => neo4j.driver(uri, neo4j.auth.basic(user, password)))

export const closeDriver = (driver: Driver): Effect.Effect<void> =>
  Effect.promise(() => driver.close())

export const verifyDriver = (driver: Driver, uri: string): Effect.Effect<void, Neo4jConnectionError> =>
  Effect.tryPromise({
    try: () => driver.verifyConnectivity(),
    catch: (e) => new Neo4jConnectionError({ uri, cause: e }),
  })

export const openSession = (driver: Driver, database: string): Effect.Effect<Session> =>
  Effect.sync(() => driver.session({ database }))

export const closeSession = (session: Session): Effect.Effect<void> =>
  Effect.promise(() => session.close())

export const runCypher = (
  session: Session,
  cypher: string,
  params: Record<string, unknown>,
): Effect.Effect<QueryResult, Neo4jQueryError> =>
  Effect.tryPromise({
    try: () => session.run(cypher, params),
    catch: (e) => new Neo4jQueryError({ cypher, cause: e }),
  })

export const runCypherWrite = (
  session: Session,
  cypher: string,
  params: Record<string, unknown>,
): Effect.Effect<QueryResult, Neo4jQueryError> =>
  Effect.tryPromise({
    try: () => session.executeWrite((tx) => tx.run(cypher, params)),
    catch: (e) => new Neo4jQueryError({ cypher, cause: e }),
  })

// --- Service ---

export class Neo4jClient extends Context.Tag("Neo4jClient")<Neo4jClient, {
  readonly query: (cypher: string, params?: Record<string, unknown>) => Effect.Effect<Neo4jRecord[], Neo4jQueryError>
  readonly queryStream: (cypher: string, params?: Record<string, unknown>) => Stream.Stream<Neo4jRecord, Neo4jQueryError>
  readonly runBatch: (cypher: string, rows: unknown[], batchSize?: number) => Effect.Effect<number, Neo4jQueryError>
}>() {}

export const Neo4jClientLive: Layer.Layer<Neo4jClient, never, Neo4jConfig> = Layer.scoped(
  Neo4jClient,
  Effect.gen(function* () {
    const config = yield* Neo4jConfig

    const driver = yield* Effect.acquireRelease(
      Effect.log(`[Neo4j:client] Connecting to ${config.uri}`).pipe(
        Effect.andThen(makeDriver(config.uri, config.user, config.password)),
      ),
      (d) => Effect.log("[Neo4j:client] Closing driver").pipe(
        Effect.andThen(closeDriver(d)),
      ),
    )

    function withSession<A>(fn: (session: Session) => Effect.Effect<A, Neo4jQueryError>): Effect.Effect<A, Neo4jQueryError> {
      return Effect.acquireUseRelease(
        openSession(driver, config.database),
        fn,
        closeSession,
      )
    }

    return {
      query: (cypher: string, params?: Record<string, unknown>) =>
        withSession((session) =>
          runCypher(session, cypher, params ?? {}).pipe(
            Effect.map((result) => result.records),
          ),
        ),

      queryStream: (cypher: string, params?: Record<string, unknown>) =>
        Stream.asyncPush<Neo4jRecord, Neo4jQueryError>((emit) =>
          Effect.acquireRelease(
            openSession(driver, config.database).pipe(
              Effect.tap((session) =>
                Effect.sync(() => {
                  const result = session.run(cypher, params ?? {})
                  result.subscribe({
                    onNext: (record) => emit.single(record),
                    onCompleted: () => emit.end(),
                    onError: (err) => emit.fail(new Neo4jQueryError({ cypher, cause: err })),
                  })
                }),
              ),
            ),
            closeSession,
          ),
        ),

      runBatch: (cypher: string, rows: unknown[], batchSize = 5000) =>
        withSession((session) =>
          Effect.gen(function* () {
            let total = 0
            for (let i = 0; i < rows.length; i += batchSize) {
              const batch = rows.slice(i, i + batchSize)
              yield* runCypherWrite(session, cypher, { rows: batch })
              total += batch.length
            }
            return total
          }),
        ),
    }
  }),
)
