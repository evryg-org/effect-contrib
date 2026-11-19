/**
 * @since 0.0.1
 */
import { Schema } from "effect"

// In Unicode mode a surrogate pair is one code point, so only a lone surrogate matches.
const loneSurrogate = /\p{Cs}/u

const holdsLoneSurrogate = (value: unknown): boolean =>
  typeof value === "string"
    ? loneSurrogate.test(value)
    : globalThis.Array.isArray(value) && value.some(holdsLoneSurrogate)

/**
 * A string that is well-formed Unicode: it holds no lone UTF-16 surrogate. A UTF-8 transport
 * carries every lone surrogate as U+FFFD, so two distinct ill-formed strings would arrive as
 * the same value, and two distinct identities would merge.
 *
 * @since 0.2.0
 */
export const WellFormedString = Schema.String.check(
  Schema.makeFilter((value) => !loneSurrogate.test(value) || "a lone UTF-16 surrogate has no UTF-8 encoding", {
    title: "well-formed Unicode string"
  })
)

/**
 * A property value: anything a store accepts, provided every string in it, or in a list of
 * them, is a {@link WellFormedString}.
 *
 * @since 0.2.0
 */
export const PropertyValue = Schema.Unknown.check(
  Schema.makeFilter((value) => !holdsLoneSurrogate(value) || "a lone UTF-16 surrogate has no UTF-8 encoding", {
    title: "property value of well-formed Unicode strings"
  })
)

// The foundational Neo4j property bag, spread-merged throughout this eDSL and by ~14 downstream
// call sites (VertexRef.key, UpsertVertex/UpsertEdge) — the arbitrary-key record IS the domain here.
/**
 * @since 0.0.1
 */
export const PropertyMap = Schema.Record(Schema.String, PropertyValue).check(
  Schema.makeFilter(
    (map) => !holdsLoneSurrogate(Object.keys(map)) || "a lone UTF-16 surrogate has no UTF-8 encoding",
    { title: "property names of well-formed Unicode strings" }
  )
)
/**
 * @since 0.0.1
 */
export type PropertyMap = typeof PropertyMap.Type

/**
 * @since 0.0.1
 */
export class VertexRef extends Schema.Class<VertexRef>("VertexRef")({
  label: WellFormedString,
  key: PropertyMap
}) {}

/**
 * @since 0.0.1
 */
export class UpsertVertex extends Schema.TaggedClass<UpsertVertex>()("UpsertVertex", {
  label: WellFormedString,
  key: PropertyMap,
  properties: PropertyMap
}) {}

/**
 * @since 0.0.1
 */
export class UpsertEdge extends Schema.TaggedClass<UpsertEdge>()("UpsertEdge", {
  label: WellFormedString,
  from: VertexRef,
  to: VertexRef,
  key: PropertyMap,
  properties: PropertyMap
}) {}

// The eDSL is append-only AND idempotent by construction: there are no destructive terms and
// no CREATE-only term. Every vertex/edge carries a MERGE key, so re-running converges; retention
// comes from deleting whole scopes out-of-band — never from ops a task can emit.
/**
 * @since 0.0.1
 */
export const GraphOp = Schema.Union([UpsertVertex, UpsertEdge]).pipe(Schema.toTaggedUnion("_tag"))
/**
 * @since 0.0.1
 */
export type GraphOp = typeof GraphOp.Type
