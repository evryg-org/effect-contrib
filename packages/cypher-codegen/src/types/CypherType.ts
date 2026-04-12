/** @since 0.0.1 */
import { Schema } from "effect"

// ── Scalar types (no recursion — use Schema.TaggedClass directly) ──

const ScalarTypeLiteral = Schema.Literal(
  "String",
  "Long",
  "Double",
  "Boolean",
  "Date",
  "DateTime",
  "LocalDateTime",
  "LocalTime",
  "Time",
  "Duration",
  "Point"
)

/**
 * @since 0.0.1
 * @category models
 */
export class ScalarType extends Schema.TaggedClass<ScalarType>()("ScalarType", {
  scalarType: ScalarTypeLiteral
}) {}

/**
 * @since 0.0.1
 * @category models
 */
export class VertexType extends Schema.TaggedClass<VertexType>()("VertexType", {
  label: Schema.String
}) {}

/**
 * @since 0.0.1
 * @category models
 */
export class EdgeType extends Schema.TaggedClass<EdgeType>()("EdgeType", {
  edgeType: Schema.String
}) {}

/**
 * @since 0.0.1
 * @category models
 */
export class VertexUnionType extends Schema.TaggedClass<VertexUnionType>()("VertexUnionType", {
  labels: Schema.Array(Schema.String)
}) {}

/**
 * @since 0.0.1
 * @category models
 */
export class UnknownType extends Schema.TaggedClass<UnknownType>()("UnknownType", {}) {}

/**
 * @since 0.0.1
 * @category models
 */
export class NeverType extends Schema.TaggedClass<NeverType>()("NeverType", {}) {}

// ── Recursive types (interface-first to break circularity) ──

/**
 * @since 0.0.1
 * @category models
 */
export interface ListType {
  readonly _tag: "ListType"
  readonly element: CypherType
}

/**
 * @since 0.0.1
 * @category models
 */
export interface MapField {
  readonly name: string
  readonly value: CypherType
}

/**
 * @since 0.0.1
 * @category models
 */
export interface MapType {
  readonly _tag: "MapType"
  readonly fields: ReadonlyArray<MapField>
}

/**
 * @since 0.0.1
 * @category models
 */
export interface NullableType {
  readonly _tag: "NullableType"
  readonly inner: CypherType
}

/**
 * @since 0.0.1
 * @category models
 */
export type CypherType =
  | ScalarType
  | ListType
  | MapType
  | NullableType
  | VertexType
  | VertexUnionType
  | EdgeType
  | UnknownType
  | NeverType

// ── Constructors for recursive variants ──

/**
 * @since 0.0.1
 * @category constructors
 */
export const ListType = (element: CypherType): ListType => ({
  _tag: "ListType" as const,
  element
})

/**
 * @since 0.0.1
 * @category constructors
 */
export const MapType = (fields: ReadonlyArray<MapField>): MapType => ({
  _tag: "MapType" as const,
  fields
})

/**
 * @since 0.0.1
 * @category constructors
 */
export const NullableType = (inner: CypherType): NullableType => ({
  _tag: "NullableType" as const,
  inner
})

// ── Schema (for encode/decode if needed) ──

/**
 * @since 0.0.1
 * @category schema
 */
export const CypherTypeSchema: Schema.Schema<CypherType> = Schema.Union(
  ScalarType,
  Schema.Struct({
    _tag: Schema.Literal("ListType"),
    element: Schema.suspend((): Schema.Schema<CypherType> => CypherTypeSchema)
  }),
  Schema.Struct({
    _tag: Schema.Literal("MapType"),
    fields: Schema.Array(Schema.Struct({
      name: Schema.String,
      value: Schema.suspend((): Schema.Schema<CypherType> => CypherTypeSchema)
    }))
  }),
  Schema.Struct({
    _tag: Schema.Literal("NullableType"),
    inner: Schema.suspend((): Schema.Schema<CypherType> => CypherTypeSchema)
  }),
  VertexType,
  VertexUnionType,
  EdgeType,
  UnknownType,
  NeverType
)
