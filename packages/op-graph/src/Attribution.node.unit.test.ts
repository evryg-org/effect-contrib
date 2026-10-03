import { describe, it, expect } from "@effect/vitest"
import { UpsertVertex, UpsertEdge, VertexRef } from "./GraphOp.js"
import { enrichVertexPropertiesBy } from "./Attribution.js"

// A per-label attribution policy: "Widget" is attributed, "Gadget" is not.
const attributionFor = (label: string): Record<string, string> =>
  label === "Widget" ? { made_by: "task-1", recipe: "abc" } : {}

describe("enrichVertexPropertiesBy", () => {
  it("attributes a vertex with the properties chosen for its own label, leaving its identity alone", () => {
    const op = enrichVertexPropertiesBy(attributionFor)(
      new UpsertVertex({ label: "Widget", key: { sku: "W1" }, properties: { n: 1 } }),
    )
    expect(op).toEqual(
      new UpsertVertex({ label: "Widget", key: { sku: "W1" }, properties: { n: 1, made_by: "task-1", recipe: "abc" } }),
    )
  })

  it("leaves a vertex whose label the policy attributes nothing to exactly as it was", () => {
    const original = new UpsertVertex({ label: "Gadget", key: { seq: 1 }, properties: { n: 2 } })
    expect(enrichVertexPropertiesBy(attributionFor)(original)).toEqual(original)
  })

  it("leaves an edge untouched — an endpoint ref carries identity only, so attribution has nowhere to go", () => {
    const edge = new UpsertEdge({
      label: "LINKS",
      from: new VertexRef({ label: "Widget", key: { sku: "W1" } }),
      to: new VertexRef({ label: "Gadget", key: { seq: 1 } }),
      key: { role: "primary" },
      properties: {},
    })
    expect(enrichVertexPropertiesBy(attributionFor)(edge)).toEqual(edge)
  })

  it("is idempotent: attributing twice yields the same op", () => {
    const once = enrichVertexPropertiesBy(attributionFor)(
      new UpsertVertex({ label: "Widget", key: { sku: "W1" }, properties: {} }),
    )
    expect(enrichVertexPropertiesBy(attributionFor)(once)).toEqual(once)
  })

  it("lets the policy override a property the op already carried, so attribution is the last word", () => {
    const op = enrichVertexPropertiesBy(attributionFor)(
      new UpsertVertex({ label: "Widget", key: { sku: "W1" }, properties: { made_by: "someone-else" } }),
    )
    expect((op as UpsertVertex).properties).toEqual({ made_by: "task-1", recipe: "abc" })
  })
})
