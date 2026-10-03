import { expect, layer } from "@effect/vitest"
import { Neo4jClient, UnconfiguredNeo4jClient } from "@evryg/effect-neo4j"
import { Effect, Layer } from "effect"
import { CleanNeo4jGraph } from "./CleanNeo4jGraph.js"
import { CleanNeo4jSchema } from "./CleanNeo4jSchema.js"
import { Neo4jConfigFromVitest } from "./Neo4jConfigFromVitest.js"

const TestNeo4j = UnconfiguredNeo4jClient.pipe(Layer.provide(Neo4jConfigFromVitest))

const declareSchema = Effect.gen(function*() {
  const neo4j = yield* Neo4jClient
  yield* neo4j.query("CREATE CONSTRAINT leftover_unique IF NOT EXISTS FOR (n:Leftover) REQUIRE n.id IS UNIQUE")
  yield* neo4j.query("CREATE INDEX leftover_name IF NOT EXISTS FOR (n:Leftover) ON (n.name)")
  yield* neo4j.query("CREATE FULLTEXT INDEX leftover_text IF NOT EXISTS FOR (n:Leftover) ON EACH [n.text]")
})

const schemaNames = Effect.gen(function*() {
  const neo4j = yield* Neo4jClient
  const constraints = yield* neo4j.query("SHOW CONSTRAINTS YIELD name RETURN name")
  const indexes = yield* neo4j.query("SHOW INDEXES YIELD name, type WHERE type <> 'LOOKUP' RETURN name")
  return {
    constraints: constraints.map((r) => String(r.get("name"))),
    indexes: indexes.map((r) => String(r.get("name")))
  }
})

layer(TestNeo4j, { timeout: "120 seconds" })("CleanNeo4jSchema (integration)", (it) => {
  it.effect("CleanNeo4jGraph leaves constraints and indexes in place", () =>
    Effect.gen(function*() {
      yield* declareSchema
      yield* CleanNeo4jGraph
      const names = yield* schemaNames
      expect(names.constraints).toContain("leftover_unique")
      expect(names.indexes).toContain("leftover_name")
    }))

  it.effect("drops every constraint and index on acquire", () =>
    Effect.gen(function*() {
      yield* declareSchema
      yield* Effect.scoped(CleanNeo4jSchema)
      const names = yield* schemaNames
      expect(names.constraints).toEqual([])
      expect(names.indexes).toEqual([])
    }))

  it.effect("drops what the scope created again on release", () =>
    Effect.gen(function*() {
      yield* Effect.scoped(Effect.gen(function*() {
        yield* CleanNeo4jSchema
        yield* declareSchema
        const during = yield* schemaNames
        expect(during.constraints).toContain("leftover_unique")
      }))
      const after = yield* schemaNames
      expect(after.constraints).toEqual([])
      expect(after.indexes).toEqual([])
    }))
})
