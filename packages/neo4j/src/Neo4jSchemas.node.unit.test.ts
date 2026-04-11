import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import neo4j from "neo4j-driver"
import { Neo4jInt, Neo4jValue } from "./Neo4jSchemas.js"

const int = neo4j.int
const decodeInt = Schema.decodeUnknownSync(Neo4jInt)
const decodeValue = Schema.decodeUnknownSync(Neo4jValue)

describe("Neo4jInt", () => {
  it.each([
    { label: "plain JS number", input: 42, expected: 42 },
    { label: "Neo4j Integer", input: int(42), expected: 42 },
    { label: "Neo4j Integer zero", input: int(0), expected: 0 },
    { label: "negative Neo4j Integer", input: int(-7), expected: -7 }
  ])("decodes $label to number", ({ expected, input }) => {
    expect(decodeInt(input)).toBe(expected)
  })
})

describe("Neo4jValue", () => {
  it("coerces a top-level Neo4j Integer", () => {
    expect(decodeValue(int(99))).toBe(99)
  })

  it("passes through plain JS primitives unchanged", () => {
    expect(decodeValue("hello")).toBe("hello")
    expect(decodeValue(3.14)).toBe(3.14)
    expect(decodeValue(true)).toBe(true)
    expect(decodeValue(null)).toBe(null)
  })

  it("recursively coerces Neo4j Integers inside arrays", () => {
    expect(decodeValue([int(1), "a", int(2)])).toEqual([1, "a", 2])
  })

  it("recursively coerces Neo4j Integers inside nested maps", () => {
    const input = {
      visibility: "public",
      paramCount: int(3),
      hasReturnType: true,
      isStatic: false
    }
    expect(decodeValue(input)).toEqual({
      visibility: "public",
      paramCount: 3,
      hasReturnType: true,
      isStatic: false
    })
  })

  it("handles deeply nested structures", () => {
    const input = [
      { name: "foo", counts: [int(1), int(2)], meta: { depth: int(3) } }
    ]
    expect(decodeValue(input)).toEqual([
      { name: "foo", counts: [1, 2], meta: { depth: 3 } }
    ])
  })

  it("handles empty arrays and objects", () => {
    expect(decodeValue([])).toEqual([])
    expect(decodeValue({})).toEqual({})
  })
})
