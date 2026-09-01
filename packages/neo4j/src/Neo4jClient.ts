/**
 * @since 0.0.1
 */
import { Cause, Context, Effect, Layer, Queue, Schema, Stream } from "effect"
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
export class Neo4jConnectionError extends Schema.TaggedErrorClass<Neo4jConnectionError>()("Neo4jConnectionError", {
  uri: Schema.String,
  cause: Schema.Defect()
}) {
  /**
   * The connection failure's message, derived from `cause`.
   *
   * A structural field like `cause` carries no message of its own, so the
   * inherited `Error#message` is empty by default. This override reports
   * `cause`'s message instead, matching what a plain `Error` would surface.
   */
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

/**
 * @since 0.0.1
 * @category errors
 */
export class Neo4jQueryError extends Schema.TaggedErrorClass<Neo4jQueryError>()("Neo4jQueryError", {
  cypher: Schema.String,
  cause: Schema.Defect()
}) {
  /**
   * The query failure's message, derived from `cause`.
   *
   * A structural field like `cause` carries no message of its own, so the
   * inherited `Error#message` is empty by default. This override reports
   * `cause`'s message instead, matching what a plain `Error` would surface.
   * The failing `cypher` remains available as a structured field for callers
   * that want it.
   */
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

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
export class Neo4jClient extends Context.Service<Neo4jClient, {
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
}>()("Neo4jClient") {}

/**
 * @since 0.0.1
 * @category constructors
 */
export const UnconfiguredNeo4jClient: Layer.Layer<Neo4jClient, never, Neo4jConfig> = Layer.effect(
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
        Stream.callback<Neo4jRecord, Neo4jQueryError>((queue) =>
          Effect.acquireRelease(
            openSession(driver, config.database),
            closeSession
          ).pipe(
            Effect.tap((session) =>
              Effect.sync(() => {
                const result = session.run(cypher, params ?? {})
                result.subscribe({
                  onNext: (record) => Queue.offerUnsafe(queue, record),
                  onCompleted: () => Queue.endUnsafe(queue),
                  onError: (err) =>
                    Queue.failCauseUnsafe(queue, Cause.fail(new Neo4jQueryError({ cypher, cause: err })))
                })
              })
            )
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
