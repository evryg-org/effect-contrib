import { describe, expectTypeOf, it } from "vitest"
import type { QueryEntry, generateDeclarations } from "./CypherDeclarationGen.js"
import type { ResolvedColumn, ResolvedParam } from "../frontend/QueryAnalyzer.js"

describe("QueryEntry", () => {
  it("columns is ReadonlyArray<ResolvedColumn>", () => {
    expectTypeOf<QueryEntry["columns"]>().toEqualTypeOf<ReadonlyArray<ResolvedColumn>>()
  })

  it("params is ReadonlyArray<ResolvedParam>", () => {
    expectTypeOf<QueryEntry["params"]>().toEqualTypeOf<ReadonlyArray<ResolvedParam>>()
  })

  it("filename is string", () => {
    expectTypeOf<QueryEntry["filename"]>().toEqualTypeOf<string>()
  })
})

describe("generateDeclarations", () => {
  it("accepts ReadonlyArray<QueryEntry> and returns string", () => {
    expectTypeOf<typeof generateDeclarations>().parameters.toEqualTypeOf<[queries: ReadonlyArray<QueryEntry>]>()
    expectTypeOf<ReturnType<typeof generateDeclarations>>().toEqualTypeOf<string>()
  })
})
