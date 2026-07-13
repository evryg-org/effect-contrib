import { describe, it, expect } from "@effect/vitest"
import { UpsertVertex, UpsertEdge, VertexRef } from "./GraphOp.js"
import { enrichVertexKeys } from "./GraphOpScope.js"

const enrich = enrichVertexKeys({ scope_id: "run-1" })

describe("enrichVertexKeys", () => {
  it("adds the extra fields to an UpsertVertex identity, leaving properties alone", () => {
    const op = enrich(new UpsertVertex({ label: "Class", key: { fqcn: "App\\A" }, properties: { name: "A" } }))

    expect(op).toEqual(new UpsertVertex({
      label: "Class",
      key: { fqcn: "App\\A", scope_id: "run-1" },
      properties: { name: "A" },
    }))
  })

  it("adds the extra fields to a sequence-keyed vertex identity", () => {
    const op = enrich(new UpsertVertex({ label: "RunLogLine", key: { seq: 1 }, properties: {} }))

    expect(op).toEqual(new UpsertVertex({ label: "RunLogLine", key: { seq: 1, scope_id: "run-1" }, properties: {} }))
  })

  it("adds the extra fields to BOTH endpoint refs of an UpsertEdge, never to the edge's own key", () => {
    const op = enrich(new UpsertEdge({
      label: "BELONGS_TO",
      from: new VertexRef({ label: "Class", key: { fqcn: "App\\A" } }),
      to: new VertexRef({ label: "File", key: { path: "src/A.php" } }),
      key: { role: "file" },
      properties: {},
    }))

    expect(op).toEqual(new UpsertEdge({
      label: "BELONGS_TO",
      from: new VertexRef({ label: "Class", key: { fqcn: "App\\A", scope_id: "run-1" } }),
      to: new VertexRef({ label: "File", key: { path: "src/A.php", scope_id: "run-1" } }),
      key: { role: "file" },
      properties: {},
    }))
  })

  it("is idempotent: enriching twice yields the same identity", () => {
    const once = enrich(new UpsertVertex({ label: "Class", key: { fqcn: "App\\A" }, properties: {} }))
    const twice = enrich(once)

    expect(twice).toEqual(once)
  })
})
