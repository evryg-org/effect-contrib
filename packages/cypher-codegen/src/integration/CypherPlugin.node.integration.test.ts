import { expect, layer } from "@effect/vitest"
import { UnconfiguredNeo4jClient } from "@evryg/effect-neo4j"
import { CleanNeo4jGraph, Neo4jConfigFromVitest } from "@evryg/effect-vitest-neo4j"
import { Effect, Layer } from "effect"
import { query as fixtureQuery } from "./Fixture.cypher"

const TestNeo4j = UnconfiguredNeo4jClient.pipe(Layer.provide(Neo4jConfigFromVitest))

layer(TestNeo4j, { timeout: "120 seconds" })("Cypher plugin (integration)", (it) => {
  it.scoped("Fixture.cypher query runs against real Neo4j and returns empty result", () =>
    Effect.gen(function*() {
      yield* CleanNeo4jGraph
      const records = yield* fixtureQuery()
      expect(records).toEqual([])
    }))
})
