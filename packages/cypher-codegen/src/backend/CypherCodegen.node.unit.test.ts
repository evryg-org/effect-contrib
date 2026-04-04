import { describe, it, expect } from "@effect/vitest"
import { extractParams, generateModule } from "./CypherCodegen"
import type { ResolvedColumn } from "../frontend/QueryAnalyzer"
import { ScalarType, ListType, MapType, UnknownType, NeverType, type CypherType } from "../types/CypherType"

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

// ── Helpers ──

const S = (t: "String" | "Long" | "Double" | "Boolean") => new ScalarType({ scalarType: t })

const col = (name: string, type: CypherType, nullable: boolean): ResolvedColumn =>
  ({ name, type, nullable })

// ── Typed codegen (with columns) ──

describe("generateModule with columns (typed codegen)", () => {
  it("generates Schema.Struct when columns are provided", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.fqcn AS fqcn", [
      col("fqcn", S("String"), false),
    ])
    expect(source).toContain("Schema.Struct")
    expect(source).toContain("Schema.String")
  })

  it("emits Neo4jRecordToObject transform with toObject()", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.fqcn AS fqcn", [
      col("fqcn", S("String"), false),
    ])
    expect(source).toContain("Neo4jRecordToObject")
    expect(source).toContain("rec.toObject")
  })

  it("composes Neo4jRecordToObject with Row via Schema.compose", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.fqcn AS fqcn", [
      col("fqcn", S("String"), false),
    ])
    expect(source).toContain("Schema.Array(Schema.compose(Neo4jRecordToObject, Row, { strict: false }))")
  })

  it("passes decoder directly to Effect.map (no lambda)", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.fqcn AS fqcn", [
      col("fqcn", S("String"), false),
    ])
    expect(source).toContain("Effect.map(neo4j.query(cypher), decodeRows)")
  })

  it("imports Neo4jInt from effect-neo4j for Long columns", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.method_count AS cnt", [
      col("cnt", S("Long"), false),
    ])
    expect(source).toContain('import { Neo4jClient, Neo4jInt } from "@/lib/effect-neo4j"')
    expect(source).toContain("Neo4jInt")
    expect(source).not.toContain("Neo4jInteger")
  })

  it("uses Schema.NullOr for nullable columns", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.namespace AS ns", [
      col("ns", S("String"), true),
    ])
    expect(source).toContain("Schema.NullOr(Schema.String)")
  })

  it("uses Schema.Array(Schema.String) for List(String) columns", () => {
    const source = generateModule("MATCH (c:Class) RETURN c.subdomains AS domains", [
      col("subdomains", ListType(S("String")), false),
    ])
    expect(source).toContain("Schema.Array(Schema.String)")
  })

  it("falls back to untyped codegen when no columns provided", () => {
    const source = generateModule("MATCH (c:Class) RETURN c")
    expect(source).not.toContain("Schema.Struct")
    expect(source).not.toContain("Neo4jRecordToObject")
    expect(source).toContain("neo4j.query(cypher)")
  })

  it("handles params AND columns together", () => {
    const source = generateModule("MATCH (c:Class {fqcn: $fqcn}) RETURN c.name AS name", [
      col("name", S("String"), false),
    ])
    expect(source).toContain("{ fqcn }")
    expect(source).toContain("Schema.Struct")
    expect(source).toContain("Schema.compose(Neo4jRecordToObject, Row")
  })

  it("emits Neo4jValue for UnknownType columns (escape hatch)", () => {
    const source = generateModule(
      "MATCH (m:Method) RETURN m.id AS id, collect({x: 1}) AS data",
      [col("id", S("String"), false), col("data", new UnknownType({}), false)],
    )
    expect(source).toContain("Neo4jValue")
  })

  it("maps NeverType to Schema.Never", () => {
    const source = generateModule(
      "MATCH (c:Class) RETURN null AS nothing",
      [col("nothing", new NeverType({}), false)],
    )
    expect(source).toContain("Schema.Never")
  })

  it("emits nested Schema.Struct for MapType columns", () => {
    const source = generateModule(
      "MATCH (m:Method) RETURN collect({id: m.id, vis: m.visibility}) AS profiles",
      [col("profiles", ListType(MapType([
        { name: "id", value: S("String") },
        { name: "vis", value: S("String") },
      ])), false)],
    )
    expect(source).toContain("Schema.Array(Schema.Struct({ id: Schema.String, vis: Schema.String }))")
  })

  it("emits Neo4jInt inside nested MapType", () => {
    const source = generateModule(
      "MATCH (m:Method) RETURN collect({count: m.ccn}) AS data",
      [col("data", ListType(MapType([
        { name: "count", value: S("Long") },
      ])), false)],
    )
    expect(source).toContain("Schema.Array(Schema.Struct({ count: Neo4jInt }))")
    expect(source).toContain('import { Neo4jClient, Neo4jInt } from "@/lib/effect-neo4j"')
  })
})

// ── Barrel generation (typed params) ──

import { generateBarrel, type BarrelEntry } from "./CypherCodegen"
import type { ResolvedParam } from "../frontend/QueryAnalyzer"

const barrelParam = (name: string, type: string): ResolvedParam =>
  ({ name, type }) as ResolvedParam

describe("generateBarrel — typed params", () => {
  it("emits string type for String param", () => {
    const entry: BarrelEntry = {
      filename: "Foo.cypher",
      cypher: "MATCH (c:Class {fqcn: $fqcn}) RETURN c.fqcn AS fqcn",
      columns: [col("fqcn", S("String"), false)],
      params: [barrelParam("fqcn", "String")],
    }
    const source = generateBarrel([entry])
    expect(source).toContain("{ fqcn }: { fqcn: string }")
  })

  it("emits number type for Long param", () => {
    const entry: BarrelEntry = {
      filename: "Bar.cypher",
      cypher: "MATCH (c:Class {method_count: $count}) RETURN c.fqcn AS fqcn",
      columns: [col("fqcn", S("String"), false)],
      params: [barrelParam("count", "Long")],
    }
    const source = generateBarrel([entry])
    expect(source).toContain("{ count }: { count: number }")
  })

  it("emits readonly string[] for StringArray param", () => {
    const entry: BarrelEntry = {
      filename: "Baz.cypher",
      cypher: "MATCH (c:Class) WHERE c.fqcn IN $ids RETURN c.fqcn AS fqcn",
      columns: [col("fqcn", S("String"), false)],
      params: [barrelParam("ids", "StringArray")],
    }
    const source = generateBarrel([entry])
    expect(source).toContain("{ ids }: { ids: readonly string[] }")
  })

  it("emits unknown for Unknown param type", () => {
    const entry: BarrelEntry = {
      filename: "Qux.cypher",
      cypher: "MATCH (c:Class) WHERE c.foo = $val RETURN c.fqcn AS fqcn",
      columns: [col("fqcn", S("String"), false)],
      params: [barrelParam("val", "Unknown")],
    }
    const source = generateBarrel([entry])
    expect(source).toContain("{ val }: { val: unknown }")
  })

  it("emits shared Neo4jRecordToObject transform once", () => {
    const entry: BarrelEntry = {
      filename: "Foo.cypher",
      cypher: "MATCH (c:Class) RETURN c.fqcn AS fqcn",
      columns: [col("fqcn", S("String"), false)],
      params: [],
    }
    const source = generateBarrel([entry])
    const matches = source.match(/Neo4jRecordToObject = Schema\.transform/g)
    expect(matches).toHaveLength(1)
    expect(source).toContain("rec.toObject")
  })

  it("composes Neo4jRecordToObject with row schema via Schema.compose", () => {
    const entry: BarrelEntry = {
      filename: "Foo.cypher",
      cypher: "MATCH (c:Class) RETURN c.fqcn AS fqcn",
      columns: [col("fqcn", S("String"), false)],
      params: [],
    }
    const source = generateBarrel([entry])
    expect(source).toContain("Schema.Array(Schema.compose(Neo4jRecordToObject, fooQueryRow, { strict: false }))")
  })

  it("passes decoder directly to Effect.map (no lambda)", () => {
    const entry: BarrelEntry = {
      filename: "Foo.cypher",
      cypher: "MATCH (c:Class) RETURN c.fqcn AS fqcn",
      columns: [col("fqcn", S("String"), false)],
      params: [],
    }
    const source = generateBarrel([entry])
    expect(source).toContain("Effect.map(neo4j.query(fooQueryCypher), decodeFooQuery)")
  })

  it("emits Neo4jValue for UnknownType columns in barrel", () => {
    const entry: BarrelEntry = {
      filename: "Bad.cypher",
      cypher: "MATCH (c:Class) RETURN c.fqcn AS fqcn",
      columns: [col("fqcn", new UnknownType({}), false)],
      params: [],
    }
    const source = generateBarrel([entry])
    expect(source).toContain("Neo4jValue")
  })
})
