import { describe, it, expect } from "@effect/vitest"
import { UpsertVertex, InsertVertex, UpsertEdge, VertexRef } from "./GraphOp.js"
import { enrichVertexKeysBy } from "./Partition.js"

// A per-label partition policy: "Widget" lives in a single-field partition, "Gadget" in a two-field one.
const partitionKeyFor = (label: string): Record<string, string> =>
  label === "Widget" ? { tenant: "t1" } : { region: "eu", zone: "z9" }

describe("enrichVertexKeysBy", () => {
  it("stamps a vertex identity with the partition key chosen for its own label", () => {
    const op = enrichVertexKeysBy(partitionKeyFor)(new UpsertVertex({ label: "Widget", key: { sku: "W1" }, properties: { n: 1 } }))
    expect(op).toEqual(new UpsertVertex({ label: "Widget", key: { sku: "W1", tenant: "t1" }, properties: { n: 1 } }))
  })

  it("stamps an InsertVertex identity, leaving properties alone", () => {
    const op = enrichVertexKeysBy(partitionKeyFor)(new InsertVertex({ label: "Gadget", key: { seq: 1 }, properties: {} }))
    expect(op).toEqual(new InsertVertex({ label: "Gadget", key: { seq: 1, region: "eu", zone: "z9" }, properties: {} }))
  })

  it("keys EACH edge endpoint by its OWN label's partition (cross-partition edge), never the edge's own key", () => {
    const op = enrichVertexKeysBy(partitionKeyFor)(new UpsertEdge({
      label: "LINKS",
      from: new VertexRef({ label: "Widget", key: { sku: "W1" } }),
      to: new VertexRef({ label: "Gadget", key: { seq: 1 } }),
      key: { role: "primary" },
      properties: {},
    }))
    expect(op).toEqual(new UpsertEdge({
      label: "LINKS",
      from: new VertexRef({ label: "Widget", key: { sku: "W1", tenant: "t1" } }),
      to: new VertexRef({ label: "Gadget", key: { seq: 1, region: "eu", zone: "z9" } }),
      key: { role: "primary" },
      properties: {},
    }))
  })

  it("is idempotent: enriching twice yields the same identity", () => {
    const once = enrichVertexKeysBy(partitionKeyFor)(new UpsertVertex({ label: "Widget", key: { sku: "W1" }, properties: {} }))
    expect(enrichVertexKeysBy(partitionKeyFor)(once)).toEqual(once)
  })
})
