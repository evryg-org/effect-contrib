import { Effect } from "effect"
import neo4j from "neo4j-driver"
import type { Neo4jConnectionConfig } from "@/lib/effect-neo4j"

/** Connect to Neo4j, verify connectivity, close driver, log success */
export function verifyNeo4j(
  config: Neo4jConnectionConfig,
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    yield* Effect.log(`Verifying Neo4j connectivity at ${config.uri}…`)
    const driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.user, config.password),
    )
    yield* Effect.tryPromise({
      try: () => driver.verifyConnectivity(),
      catch: (e) => new Error(`Neo4j unreachable at ${config.uri}: ${e}`),
    })
    yield* Effect.promise(() => driver.close())
    yield* Effect.log(`Neo4j connection verified ✓`)
  })
}
