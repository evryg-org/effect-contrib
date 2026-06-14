import { Schema } from "effect"

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

export class InsertVertex extends Schema.TaggedClass<InsertVertex>()("InsertVertex", {
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

// The eDSL is append-only by construction: there are no destructive terms. Re-run
// idempotency comes from identity (MERGE keys), retention from deleting whole scopes
// out-of-band — never from ops a task can emit.
export const GraphOp = Schema.Union([UpsertVertex, InsertVertex, UpsertEdge]).pipe(Schema.toTaggedUnion("_tag"))
export type GraphOp = typeof GraphOp.Type

export const GraphOpArray = Schema.Array(GraphOp)
export type GraphOpArray = typeof GraphOpArray.Type
