import { layer, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Neo4jClientLive } from "@/lib/effect-neo4j"
import { Neo4jConfigFromVitest } from "@/lib/effect-vitest-testcontainers"
import { query as fixtureQuery } from "./Fixture.cypher"

const TestNeo4j = Neo4jClientLive.pipe(Layer.provide(Neo4jConfigFromVitest))

layer(TestNeo4j, { timeout: "120 seconds" })("Cypher plugin (integration)", (it) => {
  it.effect("Fixture.cypher query runs against real Neo4j and returns empty result", () =>
    Effect.gen(function* () {
      const records = yield* fixtureQuery()
      expect(records).toEqual([])
    }),
  )
})
