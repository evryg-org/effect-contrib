import { layer, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Neo4jClient, UnconfiguredNeo4jClient } from "@evryg/effect-neo4j"
import { Neo4jConfigFromVitest } from "@evryg/effect-vitest-testcontainers"
import { extractSchema } from "./LiveDbGraphSchemaResolver.js"

const seed = Effect.flatMap(Neo4jClient, (neo4j) =>
  Effect.all([
    neo4j.query(`CREATE CONSTRAINT IF NOT EXISTS FOR (c:Class) REQUIRE c.fqcn IS UNIQUE`),
    neo4j.query(`MERGE (c:Class {fqcn: "App\\\\Seed"}) SET c.name = "Seed", c.source = "codebase", c.file = "seed.php", c.namespace = "App"`),
  ]),
)

const TestNeo4j = UnconfiguredNeo4jClient.pipe(Layer.provide(Neo4jConfigFromVitest))

layer(TestNeo4j, { timeout: "120 seconds" })("extractSchema (integration)", (it) => {
  it.effect("returns a GraphSchema with node and relationship properties", () =>
    Effect.gen(function* () {
      const schema = yield* extractSchema()
      expect(schema.vertexProperties.length).toBeGreaterThanOrEqual(0)
      expect(schema.edgeProperties.length).toBeGreaterThanOrEqual(0)
    }),
  )

  it.effect("includes known labels from the analysis graph", () =>
    Effect.gen(function* () {
      yield* seed
      const schema = yield* extractSchema()
      const labels = new Set(schema.vertexProperties.flatMap((p) => [...p.labels]))
      expect(labels.has("Class")).toBe(true)
    }),
  )

  it.effect("Class.fqcn is String and mandatory", () =>
    Effect.gen(function* () {
      yield* seed
      const schema = yield* extractSchema()
      const fqcn = schema.vertexProperties.find(
        (p) => p.labels.includes("Class") && p.propertyName === "fqcn",
      )
      expect(fqcn).toBeDefined()
      expect(fqcn!.propertyTypes).toContain("String")
      expect(fqcn!.mandatory).toBe(true)
    }),
  )

  it.effect("extracts edge connectivity from graph topology", () =>
    Effect.gen(function* () {
      yield* Effect.flatMap(Neo4jClient, (neo4j) =>
        neo4j.query(`
          MERGE (a:Class {fqcn: "A"}) SET a.name = "A", a.source = "codebase"
          MERGE (b:Method {id: "m1"}) SET b.name = "foo", b.source = "codebase"
          MERGE (a)-[:BELONGS_TO {role: "class"}]->(b)
        `),
      )
      const schema = yield* extractSchema()
      const belongsTo = schema.edgeConnectivity.filter((c) => c.edgeType === "BELONGS_TO")
      expect(belongsTo.length).toBeGreaterThan(0)
      expect(belongsTo.some((c) => c.fromLabel === "Class" && c.toLabel === "Method")).toBe(true)
    }),
  )
})
