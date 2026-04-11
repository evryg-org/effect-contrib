import { Effect } from "effect"
import type { Neo4jConnectionConfig } from "./Neo4jConfig"
import { Neo4jConnectionError, makeDriver, closeDriver, verifyDriver } from "./Neo4jClient"

export function verifyNeo4j(
  config: Neo4jConnectionConfig,
): Effect.Effect<void, Neo4jConnectionError> {
  return Effect.gen(function* () {
    yield* Effect.log(`Verifying Neo4j connectivity at ${config.uri}…`)
    yield* Effect.acquireUseRelease(
      makeDriver(config.uri, config.user, config.password),
      (driver) => verifyDriver(driver, config.uri),
      closeDriver,
    )
    yield* Effect.log(`Neo4j connection verified ✓`)
  })
}
