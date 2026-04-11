import { layer, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Neo4jClient, UnconfiguredNeo4jClient } from "@/lib/effect-neo4j"
import { Neo4jConfigFromVitest } from "@/lib/effect-vitest-testcontainers"

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
