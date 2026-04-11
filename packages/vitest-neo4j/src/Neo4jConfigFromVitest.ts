import { Neo4jConfig } from "@evryg/effect-neo4j"
import { Layer } from "effect"
import { inject } from "vitest"

export const Neo4jConfigFromVitest: Layer.Layer<Neo4jConfig> = Layer.succeed(Neo4jConfig, {
  uri: inject("neo4j").uri,
  user: "neo4j",
  password: inject("neo4j").password,
  database: "neo4j"
})
