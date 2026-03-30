import { describe, expectTypeOf, it } from "vitest"
import type { Effect } from "effect"
import type { Neo4jClient, Neo4jQueryError } from "@/lib/effect-neo4j"
import type {
  NodeProperty,
  RelProperty,
  GraphSchema,
  extractSchema,
  loadSchema,
  saveSchema,
} from "./SchemaExtractor"

describe("NodeProperty", () => {
  it("labels is ReadonlyArray<string>", () => {
    expectTypeOf<NodeProperty["labels"]>().toEqualTypeOf<ReadonlyArray<string>>()
  })

  it("propertyTypes is ReadonlyArray<string>", () => {
    expectTypeOf<NodeProperty["propertyTypes"]>().toEqualTypeOf<ReadonlyArray<string>>()
  })
})

describe("GraphSchema", () => {
  it("nodeProperties is ReadonlyArray<NodeProperty>", () => {
    expectTypeOf<GraphSchema["nodeProperties"]>().toEqualTypeOf<ReadonlyArray<NodeProperty>>()
  })

  it("relProperties is ReadonlyArray<RelProperty>", () => {
    expectTypeOf<GraphSchema["relProperties"]>().toEqualTypeOf<ReadonlyArray<RelProperty>>()
  })
})

describe("extractSchema", () => {
  it("returns Effect<GraphSchema, Neo4jQueryError, Neo4jClient>", () => {
    expectTypeOf<ReturnType<typeof extractSchema>>().toEqualTypeOf<
      Effect.Effect<GraphSchema, Neo4jQueryError, Neo4jClient>
    >()
  })
})

describe("loadSchema", () => {
  it("is a sync function (path) => GraphSchema", () => {
    expectTypeOf<typeof loadSchema>().parameters.toEqualTypeOf<[path: string]>()
    expectTypeOf<ReturnType<typeof loadSchema>>().toEqualTypeOf<GraphSchema>()
  })
})

describe("saveSchema", () => {
  it("is a sync function (path, schema) => void", () => {
    expectTypeOf<typeof saveSchema>().parameters.toEqualTypeOf<[path: string, schema: GraphSchema]>()
    expectTypeOf<ReturnType<typeof saveSchema>>().toEqualTypeOf<void>()
  })
})
