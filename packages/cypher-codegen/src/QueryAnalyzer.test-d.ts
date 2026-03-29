import { describe, expectTypeOf, it } from "vitest"
import type {
  Neo4jType,
  Neo4jScalarType,
  Neo4jListType,
  ResolvedColumn,
  ResolvedParam,
  QueryAnalysis,
  analyzeQuery,
} from "./QueryAnalyzer"
import type { GraphSchema } from "./SchemaExtractor"

describe("Neo4jType", () => {
  it("Neo4jScalarType covers all Neo4j scalar types", () => {
    expectTypeOf<Neo4jScalarType>().toEqualTypeOf<
      | "String"
      | "Long"
      | "Double"
      | "Boolean"
      | "Date"
      | "DateTime"
      | "LocalDateTime"
      | "LocalTime"
      | "Time"
      | "Duration"
      | "Point"
    >()
  })

  it("Neo4jListType covers all Neo4j list types", () => {
    expectTypeOf<Neo4jListType>().toEqualTypeOf<
      | "StringArray"
      | "LongArray"
      | "DoubleArray"
      | "BooleanArray"
    >()
  })

  it("Neo4jType is the union of scalar, list, and Unknown types", () => {
    expectTypeOf<Neo4jType>().toEqualTypeOf<Neo4jScalarType | Neo4jListType | "Unknown">()
  })
})

describe("ResolvedColumn", () => {
  it("nullable is required boolean, not optional", () => {
    expectTypeOf<ResolvedColumn["nullable"]>().toEqualTypeOf<boolean>()
  })

  it("type is Neo4jType", () => {
    expectTypeOf<ResolvedColumn["type"]>().toEqualTypeOf<Neo4jType>()
  })
})

describe("ResolvedParam", () => {
  it("type is Neo4jType", () => {
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
