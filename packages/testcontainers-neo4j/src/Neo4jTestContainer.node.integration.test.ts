import { layer, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Neo4jClient, Neo4jConfig, UnconfiguredNeo4jClient } from "@evryg/effect-neo4j"
import { inject } from "vitest"

const Neo4jConfigFromVitest: Layer.Layer<Neo4jConfig> = Layer.succeed(Neo4jConfig, {
  uri: inject("neo4j").uri,
  user: "neo4j",
  password: inject("neo4j").password,
  database: "neo4j",
})

const TestNeo4j = UnconfiguredNeo4jClient.pipe(Layer.provide(Neo4jConfigFromVitest))

layer(TestNeo4j, { timeout: "120 seconds" })("Neo4jTestContainer (integration)", (it) => {
  it.effect("connects and runs a query", () =>
    Effect.gen(function* () {
      const client = yield* Neo4jClient
      const records = yield* client.query("RETURN 1 AS n")
      expect(records).toHaveLength(1)
    }),
  )
})
