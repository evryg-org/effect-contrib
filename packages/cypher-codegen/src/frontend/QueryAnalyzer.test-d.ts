import { describe, expectTypeOf, it } from "vitest"
import type {
  Neo4jType,
  ResolvedColumn,
  ResolvedParam,
  QueryAnalysis,
  analyzeQuery,
} from "./QueryAnalyzer"
import type { CypherType } from "../types/CypherType"
import type { GraphSchema } from "../schema/SchemaExtractor"

describe("ResolvedColumn", () => {
  it("nullable is required boolean, not optional", () => {
    expectTypeOf<ResolvedColumn["nullable"]>().toEqualTypeOf<boolean>()
  })

  it("type is CypherType (recursive ADT)", () => {
    expectTypeOf<ResolvedColumn["type"]>().toEqualTypeOf<CypherType>()
  })
})

describe("ResolvedParam", () => {
  it("type is Neo4jType (flat, params stay scalar)", () => {
    expectTypeOf<ResolvedParam["type"]>().toEqualTypeOf<Neo4jType>()
  })
})

describe("QueryAnalysis", () => {
  it("columns is ReadonlyArray<ResolvedColumn>", () => {
    expectTypeOf<QueryAnalysis["columns"]>().toEqualTypeOf<ReadonlyArray<ResolvedColumn>>()
  })

  it("params is ReadonlyArray<ResolvedParam>", () => {
    expectTypeOf<QueryAnalysis["params"]>().toEqualTypeOf<ReadonlyArray<ResolvedParam>>()
  })
})

describe("analyzeQuery", () => {
  it("is a pure function (cypher, schema) => QueryAnalysis", () => {
    expectTypeOf<typeof analyzeQuery>().parameters.toEqualTypeOf<[cypher: string, schema: GraphSchema]>()
    expectTypeOf<ReturnType<typeof analyzeQuery>>().toEqualTypeOf<QueryAnalysis>()
  })
})
