import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadSchema, saveSchema } from "../../GraphSchemaModel.js"
import { EdgeProperty, GraphSchema, VertexProperty } from "./LiveDbGraphSchemaResolver.js"

// ── roundtrip: saveSchema → loadSchema ──

describe("GraphSchema save/load roundtrip", () => {
  it.effect("preserves schema through save and load", () =>
    Effect.gen(function*() {
      const schema = new GraphSchema({
        vertexProperties: [
          new VertexProperty({
            labels: ["Test"],
            propertyName: "id",
            propertyTypes: ["STRING NOT NULL"],
            mandatory: true
          })
        ],
        edgeProperties: [
          new EdgeProperty({
            edgeType: "KNOWS",
            propertyName: "since",
            propertyTypes: ["FLOAT NOT NULL"],
            mandatory: true
          })
        ]
      })
      const dir = mkdtempSync(join(tmpdir(), "cypher-test-"))
      const path = join(dir, "schema.json")
      yield* saveSchema(path, schema)
      const result = yield* loadSchema(path)
      rmSync(dir, { recursive: true })
      expect(result).toEqual(schema)
    }).pipe(Effect.provide(NodeContext.layer)))
})

// ── unit tests ──

describe("loadSchema", () => {
  it.effect("fails on missing file", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(loadSchema("/nonexistent/path/schema.json"))
      expect(result._tag).toBe("Left")
    }).pipe(Effect.provide(NodeContext.layer)))
})
