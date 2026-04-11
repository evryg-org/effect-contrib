import type { Neo4jClient, Neo4jQueryError } from "@evryg/effect-neo4j"
import type { Effect } from "effect"
import { describe, expectTypeOf, it } from "vitest"
import type { EdgeProperty, extractSchema, GraphSchema, VertexProperty } from "./LiveDbGraphSchemaResolver.js"

describe("VertexProperty", () => {
  it("labels is ReadonlyArray<string>", () => {
    expectTypeOf<VertexProperty["labels"]>().toEqualTypeOf<ReadonlyArray<string>>()
  })

  it("propertyTypes is ReadonlyArray<string>", () => {
    expectTypeOf<VertexProperty["propertyTypes"]>().toEqualTypeOf<ReadonlyArray<string>>()
  })
})

describe("GraphSchema", () => {
  it("vertexProperties is ReadonlyArray<VertexProperty>", () => {
    expectTypeOf<GraphSchema["vertexProperties"]>().toEqualTypeOf<ReadonlyArray<VertexProperty>>()
  })

  it("edgeProperties is ReadonlyArray<EdgeProperty>", () => {
    expectTypeOf<GraphSchema["edgeProperties"]>().toEqualTypeOf<ReadonlyArray<EdgeProperty>>()
  })
})

describe("extractSchema", () => {
  it("returns Effect<GraphSchema, Neo4jQueryError, Neo4jClient>", () => {
    expectTypeOf<ReturnType<typeof extractSchema>>().toEqualTypeOf<
      Effect.Effect<GraphSchema, Neo4jQueryError, Neo4jClient>
    >()
  })
})
