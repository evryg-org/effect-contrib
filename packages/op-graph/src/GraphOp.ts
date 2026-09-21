import { Schema } from "effect"

// The foundational Neo4j property bag, spread-merged throughout this eDSL and by ~14 downstream
// call sites (VertexRef.key, UpsertVertex/UpsertEdge) — the arbitrary-key record IS the domain here.
// ast-grep-ignore: effect/no-bare-collection-schema-alias
export const PropertyMap = Schema.Record(Schema.String, Schema.Unknown)
export type PropertyMap = typeof PropertyMap.Type

export class VertexRef extends Schema.Class<VertexRef>("VertexRef")({
  label: Schema.String,
  key: PropertyMap,
}) {}

export class UpsertVertex extends Schema.TaggedClass<UpsertVertex>()("UpsertVertex", {
  label: Schema.String,
  key: PropertyMap,
  properties: PropertyMap,
}) {}

export class UpsertEdge extends Schema.TaggedClass<UpsertEdge>()("UpsertEdge", {
  label: Schema.String,
  from: VertexRef,
  to: VertexRef,
  key: PropertyMap,
  properties: PropertyMap,
}) {}

// The eDSL is append-only AND idempotent by construction: there are no destructive terms and
// no CREATE-only term. Every vertex/edge carries a MERGE key, so re-running converges; retention
// comes from deleting whole scopes out-of-band — never from ops a task can emit.
export const GraphOp = Schema.Union([UpsertVertex, UpsertEdge]).pipe(Schema.toTaggedUnion("_tag"))
export type GraphOp = typeof GraphOp.Type
