/**
 * @since 0.0.1
 */
import { Context, Effect, Layer, Schema, Stream } from "effect"
import neo4j, { type Driver, type QueryResult, type Record as Neo4jRecord_, type Session } from "neo4j-driver"
import { Neo4jConfig } from "./Neo4jConfig.js"

/**
 * A record returned from a Neo4j query.
 *
 * @since 0.0.1
 * @category models
 */
export type Neo4jRecord = Neo4jRecord_

// --- Errors ---

/**
 * @since 0.0.1
 * @category errors
 */
export class Neo4jConnectionError extends Schema.TaggedError<Neo4jConnectionError>()("Neo4jConnectionError", {
  uri: Schema.String,
  cause: Schema.Defect
}) {}

/**
 * @since 0.0.1
 * @category errors
 */
export class Neo4jQueryError extends Schema.TaggedError<Neo4jQueryError>()("Neo4jQueryError", {
  cypher: Schema.String,
  cause: Schema.Defect
}) {}

/**
 * @since 0.0.1
 * @category errors
 */
export type Neo4jError = Neo4jConnectionError | Neo4jQueryError

// --- Effectful combinators ---

/**
 * @since 0.0.1
 * @category constructors
 */
export const makeDriver = (uri: string, user: string, password: string): Effect.Effect<Driver> =>
  Effect.sync(() => neo4j.driver(uri, neo4j.auth.basic(user, password)))

/**
 * @since 0.0.1
 * @category combinators
 */
export const closeDriver = (driver: Driver): Effect.Effect<void> => Effect.promise(() => driver.close())

/**
 * @since 0.0.1
 * @category combinators
 */
export const verifyDriver = (driver: Driver, uri: string): Effect.Effect<void, Neo4jConnectionError> =>
  Effect.tryPromise({
    try: () => driver.verifyConnectivity(),
    catch: (e) => new Neo4jConnectionError({ uri, cause: e })
  })

/**
 * @since 0.0.1
 * @category combinators
 */
export const openSession = (driver: Driver, database: string): Effect.Effect<Session> =>
  Effect.sync(() => driver.session({ database }))

/**
 * @since 0.0.1
 * @category combinators
 */
export const closeSession = (session: Session): Effect.Effect<void> => Effect.promise(() => session.close())

/**
 * @since 0.0.1
 * @category combinators
 */
export const runCypher = (
  session: Session,
  cypher: string,
  params: Record<string, unknown>
): Effect.Effect<QueryResult, Neo4jQueryError> =>
  Effect.tryPromise({
    try: () => session.run(cypher, params),
    catch: (e) => new Neo4jQueryError({ cypher, cause: e })
  })

/**
 * @since 0.0.1
 * @category combinators
 */
export const runCypherWrite = (
  session: Session,
  cypher: string,
  params: Record<string, unknown>
): Effect.Effect<QueryResult, Neo4jQueryError> =>
  Effect.tryPromise({
    try: () => session.executeWrite((tx) => tx.run(cypher, params)),
    catch: (e) => new Neo4jQueryError({ cypher, cause: e })
  })

// --- Service ---

/**
 * @since 0.0.1
 * @category models
 */
export class Neo4jClient extends Context.Tag("Neo4jClient")<Neo4jClient, {
  readonly query: (
    cypher: string,
    params?: Record<string, unknown>
  ) => Effect.Effect<Array<Neo4jRecord>, Neo4jQueryError>
  readonly queryStream: (
    cypher: string,
    params?: Record<string, unknown>
  ) => Stream.Stream<Neo4jRecord, Neo4jQueryError>
  readonly runBatch: (
    cypher: string,
    rows: Array<unknown>,
    batchSize?: number
  ) => Effect.Effect<number, Neo4jQueryError>
}>() {}

/**
 * @since 0.0.1
 * @category constructors
 */
export const UnconfiguredNeo4jClient: Layer.Layer<Neo4jClient, never, Neo4jConfig> = Layer.scoped(
  Neo4jClient,
  Effect.gen(function*() {
    const config = yield* Neo4jConfig

    const driver = yield* Effect.acquireRelease(
      Effect.log(`[Neo4j:client] Connecting to ${config.uri}`).pipe(
        Effect.andThen(makeDriver(config.uri, config.user, config.password))
      ),
      (d) =>
        Effect.log("[Neo4j:client] Closing driver").pipe(
          Effect.andThen(closeDriver(d))
        )
    )

    function withSession<A>(
      fn: (session: Session) => Effect.Effect<A, Neo4jQueryError>
    ): Effect.Effect<A, Neo4jQueryError> {
      return Effect.acquireUseRelease(
        openSession(driver, config.database),
        fn,
        closeSession
      )
    }

    return {
      query: (cypher: string, params?: Record<string, unknown>) =>
        withSession((session) =>
          runCypher(session, cypher, params ?? {}).pipe(
            Effect.map((result) => result.records)
          )
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
                    onError: (err) => emit.fail(new Neo4jQueryError({ cypher, cause: err }))
                  })
                })
              )
            ),
            closeSession
          )
        ),

      runBatch: (cypher: string, rows: Array<unknown>, batchSize = 5000) =>
        withSession((session) =>
          Effect.gen(function*() {
            let total = 0
            for (let i = 0; i < rows.length; i += batchSize) {
              const batch = rows.slice(i, i + batchSize)
              yield* runCypherWrite(session, cypher, { rows: batch })
              total += batch.length
            }
            return total
          })
        )
    }
  })
)
