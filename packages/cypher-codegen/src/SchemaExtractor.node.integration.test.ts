import { layer, expect } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { Neo4jClient, Neo4jClientLive } from "@/lib/effect-neo4j"
import { Neo4jConfigFromVitest } from "@/lib/effect-vitest-testcontainers"
import { extractSchema } from "./SchemaExtractor"

const seed = Effect.flatMap(Neo4jClient, (neo4j) =>
  Effect.all([
    neo4j.query(`CREATE CONSTRAINT IF NOT EXISTS FOR (c:Class) REQUIRE c.fqcn IS UNIQUE`),
    neo4j.query(`MERGE (c:Class {fqcn: "App\\\\Seed"}) SET c.name = "Seed", c.source = "codebase", c.file = "seed.php", c.namespace = "App", c.method_count = 0`),
  ]),
)

const TestNeo4j = Neo4jClientLive.pipe(Layer.provide(Neo4jConfigFromVitest))

layer(TestNeo4j, { timeout: "120 seconds" })("extractSchema (integration)", (it) => {
  it.effect("returns a GraphSchema with node and relationship properties", () =>
    Effect.gen(function* () {
      const schema = yield* extractSchema()
      expect(schema.nodeProperties.length).toBeGreaterThanOrEqual(0)
      expect(schema.relProperties.length).toBeGreaterThanOrEqual(0)
    }),
  )

  it.effect("includes known labels from the analysis graph", () =>
    Effect.gen(function* () {
      yield* seed
      const schema = yield* extractSchema()
      const labels = new Set(schema.nodeProperties.flatMap((p) => [...p.labels]))
      expect(labels.has("Class")).toBe(true)
    }),
  )

  it.effect("Class.fqcn is String and mandatory", () =>
    Effect.gen(function* () {
      yield* seed
      const schema = yield* extractSchema()
      const fqcn = schema.nodeProperties.find(
        (p) => p.labels.includes("Class") && p.propertyName === "fqcn",
      )
      expect(fqcn).toBeDefined()
      expect(fqcn!.propertyTypes).toContain("String")
      expect(fqcn!.mandatory).toBe(true)
    }),
  )
})
