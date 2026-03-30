import { describe, it, expect } from "@effect/vitest"
import { generateDeclarations, type QueryEntry } from "./CypherDeclarationGen"
import type { ResolvedColumn, ResolvedParam } from "../frontend/QueryAnalyzer"
import { ScalarType, ListType, type CypherType } from "../types/CypherType"

const S = (t: "String" | "Long" | "Double" | "Boolean") => new ScalarType({ scalarType: t })

const col = (name: string, type: CypherType, nullable: boolean): ResolvedColumn =>
  ({ name, type, nullable })

const param = (name: string, type: string): ResolvedParam =>
  ({ name, type }) as ResolvedParam

const entry = (
  filename: string,
  columns: ResolvedColumn[],
  params: ResolvedParam[] = [],
): QueryEntry => ({ filename, columns, params })

describe("generateDeclarations", () => {
  it("generates declare module block for a single query", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("id", S("String"), false)]),
    ])
    expect(output).toContain('declare module "*/Foo.cypher"')
    expect(output).toContain("readonly id: string")
    expect(output).toContain("export const query")
  })

  it("generates multiple declare module blocks", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("id", S("String"), false)]),
      entry("Bar.cypher", [col("name", S("String"), false)]),
    ])
    expect(output).toContain('declare module "*/Foo.cypher"')
    expect(output).toContain('declare module "*/Bar.cypher"')
  })

  it("maps nullable column to T | null", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("ns", S("String"), true)]),
    ])
    expect(output).toContain("readonly ns: string | null")
  })

  it("maps Long to number", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("cnt", S("Long"), false)]),
    ])
    expect(output).toContain("readonly cnt: number")
  })

  it("maps Double to number", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("score", S("Double"), false)]),
    ])
    expect(output).toContain("readonly score: number")
  })

  it("maps StringArray to readonly string[]", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("tags", ListType(S("String")), false)]),
    ])
    expect(output).toContain("readonly tags: readonly string[]")
  })

  it("maps LongArray to readonly number[]", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("ids", ListType(S("Long")), false)]),
    ])
    expect(output).toContain("readonly ids: readonly number[]")
  })

  it("maps temporal types to string", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [
        col("d", new ScalarType({ scalarType: "Date" }), false),
        col("dt", new ScalarType({ scalarType: "DateTime" }), false),
        col("ldt", new ScalarType({ scalarType: "LocalDateTime" }), false),
        col("t", new ScalarType({ scalarType: "Time" }), false),
        col("lt", new ScalarType({ scalarType: "LocalTime" }), false),
        col("dur", new ScalarType({ scalarType: "Duration" }), false),
      ]),
    ])
    expect(output).toContain("readonly d: string")
    expect(output).toContain("readonly dt: string")
    expect(output).toContain("readonly ldt: string")
    expect(output).toContain("readonly t: string")
    expect(output).toContain("readonly lt: string")
    expect(output).toContain("readonly dur: string")
  })

  it("maps Boolean to boolean", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("active", S("Boolean"), false)]),
    ])
    expect(output).toContain("readonly active: boolean")
  })

  it("includes typed params in query function signature", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("name", S("String"), false)], [param("fqcn", "String")]),
    ])
    expect(output).toContain("fqcn: string")
  })

  it("generates parameterless function when no params", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("id", S("String"), false)]),
    ])
    expect(output).toContain("() => Effect.Effect<")
  })

  it("generates valid output for empty entries", () => {
    const output = generateDeclarations([])
    expect(output).toContain("import type")
    expect(output).not.toContain("declare module")
  })

  it("includes Effect, Neo4jClient, Neo4jQueryError imports", () => {
    const output = generateDeclarations([
      entry("Foo.cypher", [col("id", S("String"), false)]),
    ])
    expect(output).toContain("Effect")
    expect(output).toContain("Neo4jClient")
    expect(output).toContain("Neo4jQueryError")
  })
})
