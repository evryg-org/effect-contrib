import { describe, it, expect } from "@effect/vitest"
import { Schema } from "effect"
import { UpsertVertex, InsertVertex, UpsertEdge, VertexRef, GraphOp, GraphOpArray } from "./GraphOp.js"

describe("GraphOp Schema types", () => {
  it("UpsertVertex constructs with the expected fields", () => {
    const v = new UpsertVertex({ label: "Class", key: { fqcn: "App\\Foo" }, properties: { name: "Foo" } })
    expect(GraphOp.guards.UpsertVertex(v)).toBe(true)
    expect(v.label).toBe("Class")
    expect(v.key).toEqual({ fqcn: "App\\Foo" })
    expect(v.properties).toEqual({ name: "Foo" })
  })

  it("InsertVertex constructs with the expected fields", () => {
    const v = new InsertVertex({ label: "Event", key: { id: "ev-1" }, properties: { name: "OrderPlaced" } })
    expect(GraphOp.guards.InsertVertex(v)).toBe(true)
    expect(v.label).toBe("Event")
    expect(v.key).toEqual({ id: "ev-1" })
    expect(v.properties).toEqual({ name: "OrderPlaced" })
  })

  it("UpsertVertex key and properties are separate objects", () => {
    const v = new UpsertVertex({ label: "Class", key: { fqcn: "A" }, properties: { file: "src/A.php", name: "A" } })
    expect(v.key).not.toBe(v.properties)
    expect(Object.keys(v.key)).toEqual(["fqcn"])
    expect(Object.keys(v.properties).sort()).toEqual(["file", "name"])
  })

  it("UpsertEdge from/to are VertexRefs with label+key", () => {
    const e = new UpsertEdge({
      label: "DEPENDS_ON",
      from: new VertexRef({ label: "Class", key: { fqcn: "A" } }),
      to: new VertexRef({ label: "Class", key: { fqcn: "B" } }),
      key: { kind: "calls" },
      properties: { confidence: "high" },
    })
    expect(GraphOp.guards.UpsertEdge(e)).toBe(true)
    expect(e.from.label).toBe("Class")
    expect(e.from.key).toEqual({ fqcn: "A" })
    expect(e.to.label).toBe("Class")
    expect(e.to.key).toEqual({ fqcn: "B" })
  })

  it("JSON encode/decode round-trips via Schema", () => {
    const ops: GraphOpArray = [
      new UpsertVertex({ label: "Class", key: { fqcn: "A" }, properties: { name: "A" } }),
      new InsertVertex({ label: "Event", key: { id: "ev-1" }, properties: { name: "OrderPlaced" } }),
      new UpsertEdge({
        label: "DEPENDS_ON",
        from: new VertexRef({ label: "Class", key: { fqcn: "A" } }),
        to: new VertexRef({ label: "Class", key: { fqcn: "B" } }),
        key: { kind: "calls" },
        properties: {},
      }),
    ]

    const json = Schema.encodeSync(Schema.fromJsonString(GraphOpArray))(ops)
    const decoded = Schema.decodeSync(Schema.fromJsonString(GraphOpArray))(json)

    expect(decoded).toHaveLength(3)
    expect(GraphOp.guards.UpsertVertex(decoded[0])).toBe(true)
    expect(GraphOp.guards.InsertVertex(decoded[1])).toBe(true)
    expect(GraphOp.guards.UpsertEdge(decoded[2])).toBe(true)
  })

  it("preserves order in array", () => {
    const ops: GraphOpArray = [
      new InsertVertex({ label: "A", key: { id: "0" }, properties: {} }),
      new UpsertVertex({ label: "B", key: { id: "1" }, properties: {} }),
      new InsertVertex({ label: "C", key: { id: "2" }, properties: {} }),
    ]

    const encoded = Schema.encodeSync(GraphOpArray)(ops)
    const decoded = Schema.decodeSync(GraphOpArray)(encoded)
    expect(GraphOp.guards.InsertVertex(decoded[0])).toBe(true)
    expect(GraphOp.guards.UpsertVertex(decoded[1])).toBe(true)
    expect(GraphOp.guards.InsertVertex(decoded[2])).toBe(true)
    expect((decoded[0] as InsertVertex).label).toBe("A")
    expect((decoded[2] as InsertVertex).label).toBe("C")
  })
})
