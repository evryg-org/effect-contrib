import { describe, expectTypeOf, it } from "vitest"
import type { extractParams, generateModule } from "./cypher-codegen"

describe("extractParams types", () => {
  it("returns ReadonlyArray<string>, not mutable string[]", () => {
    expectTypeOf<ReturnType<typeof extractParams>>().toEqualTypeOf<ReadonlyArray<string>>()
  })

  it("accepts a plain string input", () => {
    expectTypeOf<typeof extractParams>().parameter(0).toEqualTypeOf<string>()
  })
})

describe("generateModule types", () => {
  it("returns string", () => {
    expectTypeOf<ReturnType<typeof generateModule>>().toEqualTypeOf<string>()
  })

  it("accepts a plain string input", () => {
    expectTypeOf<typeof generateModule>().parameter(0).toEqualTypeOf<string>()
  })
})
