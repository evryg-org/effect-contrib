import { describe, it, expect } from "@effect/vitest"
import { Arbitrary, Effect, Schema } from "effect"
import { NodeContext } from "@effect/platform-node"
import fc from "fast-check"
import {
  VertexProperty,
  EdgeProperty,
  GraphSchema,
} from "./LiveDbGraphSchemaResolver.js"
import { loadSchema, saveSchema } from "../../GraphSchemaModel.js"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ── roundtrip: saveSchema → loadSchema ──

describe("GraphSchema save/load roundtrip", () => {
  it.effect("preserves schema through save and load", () =>
    Effect.gen(function* () {
      const schema = new GraphSchema({
        vertexProperties: [
          new VertexProperty({ labels: ["Test"], propertyName: "id", propertyTypes: ["STRING NOT NULL"], mandatory: true }),
        ],
        edgeProperties: [
          new EdgeProperty({ edgeType: "KNOWS", propertyName: "since", propertyTypes: ["FLOAT NOT NULL"], mandatory: true }),
        ],
      })
      const dir = mkdtempSync(join(tmpdir(), "cypher-test-"))
      const path = join(dir, "schema.json")
      yield* saveSchema(path, schema)
      const result = yield* loadSchema(path)
      rmSync(dir, { recursive: true })
      expect(result).toEqual(schema)
    }).pipe(Effect.provide(NodeContext.layer)),
  )
})

// ── unit tests ──

describe("loadSchema", () => {
  it.effect("fails on missing file", () =>
    Effect.gen(function* () {
      const result = yield* Effect.either(loadSchema("/nonexistent/path/schema.json"))
      expect(result._tag).toBe("Left")
    }).pipe(Effect.provide(NodeContext.layer)),
  )
})
