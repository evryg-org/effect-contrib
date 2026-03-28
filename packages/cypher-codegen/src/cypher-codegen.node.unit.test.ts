import { describe, it, expect } from "@effect/vitest"
import { extractParams, generateModule } from "./cypher-codegen"

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
