/**
 * @since 0.0.1
 */
import { Effect } from "effect"
import { closeDriver, makeDriver, verifyDriver } from "./Neo4jClient.js"
import type { Neo4jConnectionError } from "./Neo4jClient.js"
import type { Neo4jConnectionConfig } from "./Neo4jConfig.js"

/**
 * @since 0.0.1
 * @category utils
 */
export function verifyNeo4j(
  config: Neo4jConnectionConfig
): Effect.Effect<void, Neo4jConnectionError> {
  return Effect.gen(function*() {
    yield* Effect.log(`Verifying Neo4j connectivity at ${config.uri}…`)
    yield* Effect.acquireUseRelease(
      makeDriver(config.uri, config.user, config.password),
      (driver) => verifyDriver(driver, config.uri),
      closeDriver
    )
    yield* Effect.log(`Neo4j connection verified ✓`)
  })
}
