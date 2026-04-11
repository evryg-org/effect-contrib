import neo4j, { type Driver, type Session, type Record as Neo4jRecord } from "neo4j-driver"
import { Context, Effect, Layer } from "effect"
import { Neo4jConfig } from "./Neo4jConfig"

export type { Record as Neo4jRecord } from "neo4j-driver"

export class Neo4jClient extends Context.Tag("Neo4jClient")<Neo4jClient, {
  readonly query: (cypher: string, params?: Record<string, unknown>) => Effect.Effect<Neo4jRecord[], Error>
  readonly runBatch: (cypher: string, rows: unknown[], batchSize?: number) => Effect.Effect<number, Error>
}>() {}

export const Neo4jClientLive: Layer.Layer<Neo4jClient, Error, Neo4jConfig> = Layer.scoped(
  Neo4jClient,
  Effect.gen(function* () {
    const config = yield* Neo4jConfig
    yield* Effect.log(`[Neo4j:client] Connecting to ${config.uri}`)
    const driver: Driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password))

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.log("[Neo4j:client] Closing driver")
        yield* Effect.promise(() => driver.close())
      })
    )

    function withSession<A>(fn: (session: Session) => Promise<A>): Effect.Effect<A, Error> {
      return Effect.tryPromise({
        try: async () => {
          const session = driver.session({ database: config.database })
          try {
            return await fn(session)
          } finally {
            await session.close()
          }
        },
        catch: (e) => new Error(String(e)),
      })
    }

    return {
      query: (cypher: string, params?: Record<string, unknown>) =>
        withSession(async (session) => {
          const result = await session.run(cypher, params ?? {})
          return result.records
        }),

      runBatch: (cypher: string, rows: unknown[], batchSize = 1000) =>
        Effect.gen(function* () {
          let total = 0
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize)
            yield* withSession(async (session) => {
              await session.run(cypher, { rows: batch })
            })
            total += batch.length
          }
          return total
        }),
    }
  })
)
