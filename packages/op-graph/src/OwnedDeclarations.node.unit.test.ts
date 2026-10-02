import { describe, it, expect } from "@effect/vitest"
import { Function, Option, Result, Schema } from "effect"
import {
  DuplicateDeclarationError,
  EdgeDeclaration,
  EndpointPair,
  OwnedDeclarations,
  UndeclaredLabel,
  VertexDeclaration,
  checkOwnedGraphOp,
} from "./DeclarationCheck.js"
import { UpsertEdge, UpsertVertex, VertexRef } from "./GraphOp.js"

const alpha = () => new VertexDeclaration({ label: "Alpha", fields: { id: Schema.String, note: Schema.optional(Schema.String) } })
const beta = () => new VertexDeclaration({ label: "Beta", fields: { id: Schema.String } })
const links = () =>
  new EdgeDeclaration({
    label: "LINKS",
    fields: {},
    connectivity: [new EndpointPair({ from: "Alpha", to: "Beta" })],
  })

const owned = () => Result.getOrThrow(OwnedDeclarations.fromDeclarations({ own: [alpha(), links()], referenced: [beta()] }))

const betaUpsert = () => new UpsertVertex({ label: "Beta", key: { id: "b1" }, properties: {} })
const linksEdge = () =>
  new UpsertEdge({
    label: "LINKS",
    from: new VertexRef({ label: "Alpha", key: { id: "a1" } }),
    to: new VertexRef({ label: "Beta", key: { id: "b1" } }),
    key: {},
    properties: {},
  })

describe("checkOwnedGraphOp", () => {
  it("refuses a referenced label as an UpsertVertex target", () => {
    const reason = Result.match(checkOwnedGraphOp(owned())(betaUpsert()), {
      onFailure: (violation) => Option.some(violation.reason),
      onSuccess: Function.constant(Option.none()),
    })
    expect(reason).toEqual(Option.some(new UndeclaredLabel()))
  })

  it("accepts the same label as an edge endpoint", () => {
    expect(Result.isSuccess(checkOwnedGraphOp(owned())(linksEdge()))).toBe(true)
  })

  it("accepts an own label as an UpsertVertex target", () => {
    const op = new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { note: "n" } })
    expect(Result.isSuccess(checkOwnedGraphOp(owned())(op))).toBe(true)
  })

  it("refuses a label that is both own and referenced when built", () => {
    const built = OwnedDeclarations.fromDeclarations({ own: [alpha()], referenced: [alpha()] })
    expect(Result.isFailure(built) && built.failure).toEqual(new DuplicateDeclarationError({ label: "Alpha" }))
  })
})
