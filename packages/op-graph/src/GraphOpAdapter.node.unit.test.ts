import { describe, it, expect } from "@effect/vitest"
import { Schema } from "effect"
import { graphOpAdapter } from "./GraphOpAdapter.js"
import { UpsertVertex, GraphOp } from "./GraphOp.js"

describe("graphOpAdapter", () => {
  type Result = { readonly fqcn: string }
  const toOps = (r: Result): ReadonlyArray<GraphOp> => [
    new UpsertVertex({ label: "Class", key: { fqcn: r.fqcn }, properties: {} }),
  ]

  it("decode applies the mapper (A -> readonly GraphOp[])", () => {
    const adapter = graphOpAdapter(toOps)
    const ops = Schema.decodeSync(adapter)({ fqcn: "App\\Foo" })
    expect(ops).toHaveLength(1)
    expect(GraphOp.guards.UpsertVertex(ops[0])).toBe(true)
    expect(ops[0]).toMatchObject({ label: "Class", key: { fqcn: "App\\Foo" } })
  })

  it("is one-way: encode throws", () => {
    const adapter = graphOpAdapter(toOps)
    expect(() => Schema.encodeSync(adapter)(toOps({ fqcn: "App\\Foo" }))).toThrow(/one-way/)
  })
})
