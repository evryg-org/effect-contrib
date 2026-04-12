/** @since 0.0.1 */
import { Neo4jConfig } from "@evryg/effect-neo4j"
import { Layer } from "effect"
import { inject } from "vitest"

/**
 * @since 0.0.1
 * @category config
 */
export const Neo4jConfigFromVitest: Layer.Layer<Neo4jConfig> = Layer.succeed(Neo4jConfig, {
  uri: inject("neo4j").uri,
  user: "neo4j",
  password: inject("neo4j").password,
  database: "neo4j"
})
