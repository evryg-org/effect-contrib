import { describe, it, expect } from "@effect/vitest"
import { Function, Option, Result, Schema } from "effect"
import {
  DeclarationIndex,
  EdgeDeclaration,
  EndpointPair,
  NullOnRequired,
  UndeclaredConnectivity,
  UndeclaredLabel,
  UndeclaredProperty,
  VertexDeclaration,
  checkGraphOp,
  checkGraphOps,
} from "./DeclarationCheck.js"
import { UpsertEdge, UpsertVertex, VertexRef, type GraphOp } from "./GraphOp.js"

const alpha = () =>
  new VertexDeclaration({
    label: "Alpha",
    fields: { id: Schema.String, category: Schema.String, note: Schema.optional(Schema.String), ordinal: Schema.Number },
  })

const beta = () => new VertexDeclaration({ label: "Beta", fields: { id: Schema.String } })

const links = () =>
  new EdgeDeclaration({
    label: "LINKS",
    fields: { ordinal: Schema.Number },
    connectivity: [new EndpointPair({ from: "Alpha", to: "Beta" })],
  })

const indexed = () => Result.getOrThrow(DeclarationIndex.fromDeclarations([alpha(), beta(), links()]))
const check = (op: GraphOp) => checkGraphOp(indexed())(op)
const violationOf = (op: GraphOp) => Result.match(check(op), { onFailure: Function.identity, onSuccess: Function.constNull })
const reasonOf = (op: GraphOp) => Option.map(Option.fromNullishOr(violationOf(op)), (v) => v.reason)

const validEdge = () =>
  new UpsertEdge({
    label: "LINKS",
    from: new VertexRef({ label: "Alpha", key: { id: "a1" } }),
    to: new VertexRef({ label: "Beta", key: { id: "b1" } }),
    key: { ordinal: 1 },
    properties: {},
  })

describe("checkGraphOp over vertices", () => {
  it("accepts a write naming every declared field", () => {
    const op = new UpsertVertex({
      label: "Alpha",
      key: { id: "a1" },
      properties: { category: "core", note: "hi", ordinal: 3 },
    })
    expect(violationOf(op)).toBeNull()
  })

  it("accepts a partial write, since a write is `SET n += props`", () => {
    expect(violationOf(new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { ordinal: 1 } }))).toBeNull()
  })

  it("accepts null on an optional property, which is how Neo4j removes it", () => {
    expect(violationOf(new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { note: null } }))).toBeNull()
  })

  it("refuses null on a required property", () => {
    const op = new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { category: null } })
    expect(reasonOf(op)).toEqual(Option.some(new NullOnRequired({ property: "category" })))
  })

  it("refuses an undeclared property", () => {
    const op = new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { colour: "red" } })
    expect(reasonOf(op)).toEqual(Option.some(new UndeclaredProperty({ property: "colour" })))
  })

  it("refuses an undeclared key field", () => {
    const op = new UpsertVertex({ label: "Alpha", key: { id: "a1", slug: "s" }, properties: {} })
    expect(reasonOf(op)).toEqual(Option.some(new UndeclaredProperty({ property: "slug" })))
  })

  it("refuses a value the field schema cannot decode, carrying the field schema's own issue", () => {
    const op = new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { ordinal: "three" } })
    const violation = violationOf(op)
    expect(violation?.reason).toMatchObject({ property: "ordinal" })
    const message = String(violation?.message)
    expect(message).toContain("ordinal")
    expect(message).toContain("number")
  })

  it("refuses an undeclared label", () => {
    const op = new UpsertVertex({ label: "Gamma", key: { id: "g1" }, properties: {} })
    expect(reasonOf(op)).toEqual(Option.some(new UndeclaredLabel()))
  })

  it("names op, label, key and property in the violation message", () => {
    const op = new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { category: null } })
    const message = String(violationOf(op)?.message)
    expect(message).toContain("UpsertVertex")
    expect(message).toContain("Alpha")
    expect(message).toContain("a1")
    expect(message).toContain("category")
  })
})

describe("checkGraphOp over edges", () => {
  it("accepts an edge on a declared connectivity pair", () => {
    expect(violationOf(validEdge())).toBeNull()
  })

  it("refuses an edge on an undeclared connectivity pair", () => {
    const op = new UpsertEdge({
      ...validEdge(),
      from: new VertexRef({ label: "Beta", key: { id: "b1" } }),
      to: new VertexRef({ label: "Alpha", key: { id: "a1" } }),
    })
    expect(reasonOf(op)).toEqual(Option.some(new UndeclaredConnectivity({ from: "Beta", to: "Alpha" })))
  })

  it("refuses an undeclared edge key property", () => {
    expect(reasonOf(new UpsertEdge({ ...validEdge(), key: { weight: 2 } }))).toEqual(
      Option.some(new UndeclaredProperty({ property: "weight" })),
    )
  })

  it("refuses an undeclared key field on an endpoint ref, naming that endpoint", () => {
    const op = new UpsertEdge({ ...validEdge(), to: new VertexRef({ label: "Beta", key: { slug: "b1" } }) })
    expect(violationOf(op)?.reason).toEqual(new UndeclaredProperty({ property: "slug" }))
    expect(violationOf(op)?.label).toBe("Beta")
  })

  it("refuses an undeclared endpoint label", () => {
    const op = new UpsertEdge({ ...validEdge(), to: new VertexRef({ label: "Gamma", key: { id: "g1" } }) })
    expect(violationOf(op)?.reason).toEqual(new UndeclaredLabel())
    expect(violationOf(op)?.label).toBe("Gamma")
  })
})

describe("the index and the batch", () => {
  it("keeps edge types and vertex labels in separate namespaces", () => {
    const shared = Result.getOrThrow(
      DeclarationIndex.fromDeclarations([new VertexDeclaration({ label: "LINKS", fields: { id: Schema.String } }), links()]),
    )
    expect(Option.isSome(shared.vertex("LINKS"))).toBe(true)
    expect(Option.isSome(shared.edge("LINKS"))).toBe(true)
    expect(shared.vertexLabels()).toEqual(["LINKS"])
    expect(shared.edgeLabels()).toEqual(["LINKS"])
  })

  it("refuses two declarations of the same vertex label", () => {
    expect(Result.isFailure(DeclarationIndex.fromDeclarations([alpha(), alpha()]))).toBe(true)
  })

  it("merges same-type edge declarations, so each contributing context adds its own share", () => {
    const merged = Result.getOrThrow(
      DeclarationIndex.fromDeclarations([
        alpha(),
        beta(),
        links(),
        new EdgeDeclaration({
          label: "LINKS",
          fields: { role: Schema.String },
          connectivity: [new EndpointPair({ from: "Beta", to: "Alpha" })],
        }),
      ]),
    )
    const checkMerged = (op: GraphOp) =>
      Result.match(checkGraphOp(merged)(op), { onFailure: Function.identity, onSuccess: Function.constNull })
    const reversed = new UpsertEdge({
      label: "LINKS",
      from: new VertexRef({ label: "Beta", key: { id: "b1" } }),
      to: new VertexRef({ label: "Alpha", key: { id: "a1" } }),
      key: { role: "owner" },
      properties: {},
    })
    expect(checkMerged(reversed)).toBeNull()
    expect(checkMerged(validEdge())).toBeNull()
  })

  it("fails a batch on its first violation", () => {
    const ops: ReadonlyArray<GraphOp> = [
      new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: {} }),
      new UpsertVertex({ label: "Alpha", key: { id: "a2" }, properties: { category: null } }),
      new UpsertVertex({ label: "Gamma", key: { id: "g1" }, properties: {} }),
    ]
    const outcome = Result.match(checkGraphOps(indexed())(ops), {
      onFailure: Function.identity,
      onSuccess: Function.constNull,
    })
    expect(outcome?.reason).toEqual(new NullOnRequired({ property: "category" }))
  })

  it("returns the ops unchanged when the whole batch is declared", () => {
    const ops: ReadonlyArray<GraphOp> = [new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: {} })]
    expect(Result.match(checkGraphOps(indexed())(ops), { onFailure: Function.constNull, onSuccess: Function.identity })).toEqual(ops)
  })
})
