import type { Schema } from "effect"
import { describe, expectTypeOf, it } from "vitest"
import type { Neo4jInt, Neo4jValue } from "./Neo4jSchemas.js"

describe("Neo4jInt", () => {
  it("decodes to number", () => {
    expectTypeOf<Schema.Schema.Type<typeof Neo4jInt>>().toEqualTypeOf<number>()
  })

  it("accepts unknown input (Neo4j driver values)", () => {
    expectTypeOf<Schema.Schema.Encoded<typeof Neo4jInt>>().toEqualTypeOf<unknown>()
  })
})

describe("Neo4jValue", () => {
  it("decodes to unknown (preserves structural flexibility for untyped columns)", () => {
    expectTypeOf<Schema.Schema.Type<typeof Neo4jValue>>().toEqualTypeOf<unknown>()
  })

  it("accepts unknown input", () => {
    expectTypeOf<Schema.Schema.Encoded<typeof Neo4jValue>>().toEqualTypeOf<unknown>()
  })
})
