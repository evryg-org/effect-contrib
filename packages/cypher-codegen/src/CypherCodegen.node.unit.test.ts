import { describe, it, expect } from "@effect/vitest"
import { extractParams, generateModule } from "./CypherCodegen"
import type { ResolvedColumn } from "./QueryAnalyzer"

describe("extractParams", () => {
  it.each([
    { input: "MATCH (c:Class) RETURN c", expected: [] },
    { input: "MATCH (c:Class {fqcn: $fqcn}) RETURN c", expected: ["fqcn"] },
    {
      input: "MATCH (c) WHERE c.fqcn = $fqcn AND c.source = $source",
      expected: ["fqcn", "source"],
    },
    {
      input: "MATCH (c) WHERE c.name = $name OR c.name = $name",
      expected: ["name"],
      label: "deduplicates repeated params",
    },
    {
      input: "UNWIND $rows AS row CREATE (:Foo {x: row.x})",
      expected: ["rows"],
    },
    {
      input: "MATCH (c) WHERE c.$notAParam = 1",
      expected: ["notAParam"],
      label: "extracts dollar-prefixed identifiers regardless of position",
    },
  ])("extracts $expected from '$input'", ({ input, expected }) => {
    expect(extractParams(input)).toEqual(expected)
  })
})

describe("generateModule", () => {
  it("generates parameterless query function when no params", () => {
    const source = generateModule("MATCH (c:Class) RETURN c")
    expect(source).toContain("export const query = ()")
  })

  it("generates destructured params when query has parameters", () => {
    const source = generateModule(
      "MATCH (c) WHERE c.fqcn = $fqcn AND c.source = $source RETURN c",
    )
    expect(source).toContain("export const query = ({ fqcn, source })")
  })

  it("imports Effect and Neo4jClient", () => {
    const source = generateModule("MATCH (c) RETURN c")
    expect(source).toContain('import { Effect } from "effect"')
    expect(source).toContain('import { Neo4jClient } from "@/lib/effect-neo4j"')
  })

  it("uses Effect.flatMap over Neo4jClient", () => {
    const source = generateModule("MATCH (c) RETURN c")
    expect(source).toContain("Effect.flatMap(Neo4jClient")
  })

  it("preserves cypher text as JSON-stringified constant", () => {
    const cypher = "MATCH (c:Class {fqcn: $fqcn})\nRETURN c"
    const source = generateModule(cypher)
    expect(source).toContain(`const cypher = ${JSON.stringify(cypher)}`)
  })
})

// ── Typed codegen (with columns) ──

const col = (name: string, type: string, nullable: boolean): ResolvedColumn =>
  ({ name, type, nullable }) as ResolvedColumn

describe("generateModule with columns (typed codegen)", () => {
  it("generates Schema.Struct when columns are provided", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.fqcn AS fqcn", [
      col("fqcn", "String", false),
    ])
    expect(source).toContain("Schema.Struct")
    expect(source).toContain("Schema.String")
  })

  it("uses Schema.decodeUnknownSync for row decoding", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.fqcn AS fqcn", [
      col("fqcn", "String", false),
    ])
    expect(source).toContain("Schema.decodeUnknownSync")
  })

  it("generates recordToRow extractor", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.fqcn AS fqcn", [
      col("fqcn", "String", false),
    ])
    expect(source).toContain("recordToRow")
    expect(source).toContain('rec.get("fqcn")')
  })

  it("maps records in the query return", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.fqcn AS fqcn", [
      col("fqcn", "String", false),
    ])
    expect(source).toContain("recs.map(recordToRow)")
  })

  it("emits Neo4jInteger transform for Long columns", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.method_count AS cnt", [
      col("cnt", "Long", false),
    ])
    expect(source).toContain("Neo4jInteger")
    expect(source).toContain(".toNumber()")
  })

  it("uses Schema.NullOr for nullable columns", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.namespace AS ns", [
      col("ns", "String", true),
    ])
    expect(source).toContain("Schema.NullOr(Schema.String)")
  })

  it("uses Schema.Array(Schema.String) for StringArray columns", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.domains AS domains", [
      col("domains", "StringArray", false),
    ])
    expect(source).toContain("Schema.Array(Schema.String)")
  })

  it("converts temporal types with .toString()", () => {
    const source = generateModule("MATCH (e:Event) RETURN e.ts AS ts", [
      col("ts", "DateTime", false),
    ])
    expect(source).toContain(".toString()")
  })

  it("falls back to untyped codegen when no columns provided", () => {
    const source = generateModule("MATCH (c:Class) RETURN c")
    expect(source).not.toContain("Schema.Struct")
    expect(source).not.toContain("recordToRow")
    expect(source).toContain("neo4j.query(cypher)")
  })

  it("handles params AND columns together", () => {
    const source = generateModule("MATCH (c:Class {fqcn: $fqcn}) RETURN c.name AS name", [
      col("name", "String", false),
    ])
    expect(source).toContain("{ fqcn }")
    expect(source).toContain("Schema.Struct")
    expect(source).toContain("recordToRow")
  })
})
