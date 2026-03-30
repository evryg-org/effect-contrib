import { describe, it, expect } from "@effect/vitest"
import { Arbitrary, Schema } from "effect"
import fc from "fast-check"
import { roundTripLaw } from "@/lib/effect-algebraic-laws"
import {
  NodeProperty,
  RelProperty,
  GraphSchema,
  loadSchema,
  saveSchema,
} from "./SchemaExtractor"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ── roundtrip law: saveSchema → loadSchema ──

roundTripLaw({
  name: "GraphSchema save/load",
  arb: Arbitrary.make(GraphSchema),
  encode: (schema) => {
    const dir = mkdtempSync(join(tmpdir(), "cypher-test-"))
    const path = join(dir, "schema.json")
    saveSchema(path, schema)
    return path
  },
  decode: (path) => {
    const result = loadSchema(path)
    rmSync(join(path, ".."), { recursive: true })
    return result
  },
  eq: (a, b) => expect(a).toEqual(b),
})

// ── unit tests ──

describe("loadSchema", () => {
  it("throws on missing file", () => {
    expect(() => loadSchema("/nonexistent/path/schema.json")).toThrow()
  })
})
