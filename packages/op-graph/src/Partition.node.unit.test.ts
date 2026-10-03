import { describe, expect, it } from "@effect/vitest"
import { Result } from "effect"
import { UpsertEdge, UpsertVertex, VertexRef } from "./GraphOp.js"
import { enrichVertexKeysBy, enrichVertexKeysByResult } from "./Partition.js"

// A per-label partition policy: "Widget" lives in a single-field partition, "Gadget" in a two-field one.
const partitionKeyFor = (label: string): Record<string, string> =>
  label === "Widget" ? { tenant: "t1" } : { region: "eu", zone: "z9" }

describe("enrichVertexKeysBy", () => {
  it("stamps a vertex identity with the partition key chosen for its own label", () => {
    const op = enrichVertexKeysBy(partitionKeyFor)(
      new UpsertVertex({ label: "Widget", key: { sku: "W1" }, properties: { n: 1 } })
    )
    expect(op).toEqual(new UpsertVertex({ label: "Widget", key: { sku: "W1", tenant: "t1" }, properties: { n: 1 } }))
  })

  it("stamps a multi-field-partition vertex identity, leaving properties alone", () => {
    const op = enrichVertexKeysBy(partitionKeyFor)(
      new UpsertVertex({ label: "Gadget", key: { seq: 1 }, properties: {} })
    )
    expect(op).toEqual(new UpsertVertex({ label: "Gadget", key: { seq: 1, region: "eu", zone: "z9" }, properties: {} }))
  })

  it("keys EACH edge endpoint by its OWN label's partition (cross-partition edge), never the edge's own key", () => {
    const op = enrichVertexKeysBy(partitionKeyFor)(
      new UpsertEdge({
        label: "LINKS",
        from: new VertexRef({ label: "Widget", key: { sku: "W1" } }),
        to: new VertexRef({ label: "Gadget", key: { seq: 1 } }),
        key: { role: "primary" },
        properties: {}
      })
    )
    expect(op).toEqual(
      new UpsertEdge({
        label: "LINKS",
        from: new VertexRef({ label: "Widget", key: { sku: "W1", tenant: "t1" } }),
        to: new VertexRef({ label: "Gadget", key: { seq: 1, region: "eu", zone: "z9" } }),
        key: { role: "primary" },
        properties: {}
      })
    )
  })

  it("is idempotent: enriching twice yields the same identity", () => {
    const once = enrichVertexKeysBy(partitionKeyFor)(
      new UpsertVertex({ label: "Widget", key: { sku: "W1" }, properties: {} })
    )
    expect(enrichVertexKeysBy(partitionKeyFor)(once)).toEqual(once)
  })
})

// A partial policy: "Widget" has a partition, every other label is refused with its name.
const partialPartitionKeyFor = (label: string): Result.Result<Record<string, string>, string> =>
  label === "Widget" ? Result.succeed({ tenant: "t1" }) : Result.fail(label)

describe("enrichVertexKeysByResult", () => {
  it("stamps a vertex identity the policy partitions", () => {
    const op = enrichVertexKeysByResult(partialPartitionKeyFor)(
      new UpsertVertex({ label: "Widget", key: { sku: "W1" }, properties: {} })
    )
    expect(op).toEqual(
      Result.succeed(new UpsertVertex({ label: "Widget", key: { sku: "W1", tenant: "t1" }, properties: {} }))
    )
  })

  it("refuses a vertex whose label the policy refuses, with the policy's own failure", () => {
    expect(
      enrichVertexKeysByResult(partialPartitionKeyFor)(
        new UpsertVertex({ label: "Gadget", key: { seq: 1 }, properties: {} })
      )
    )
      .toEqual(Result.fail("Gadget"))
  })

  it("refuses an edge when either endpoint's label is refused", () => {
    const edge = (from: string, to: string) =>
      new UpsertEdge({
        label: "LINKS",
        from: new VertexRef({ label: from, key: { sku: "W1" } }),
        to: new VertexRef({ label: to, key: { seq: 1 } }),
        key: {},
        properties: {}
      })
    expect(enrichVertexKeysByResult(partialPartitionKeyFor)(edge("Widget", "Gadget"))).toEqual(Result.fail("Gadget"))
    expect(enrichVertexKeysByResult(partialPartitionKeyFor)(edge("Gadget", "Widget"))).toEqual(Result.fail("Gadget"))
  })
})
