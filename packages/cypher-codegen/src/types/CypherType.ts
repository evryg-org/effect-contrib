import { Schema } from "effect"

// ── Scalar types (no recursion — use Schema.TaggedClass directly) ──

const ScalarTypeLiteral = Schema.Literal(
  "String", "Long", "Double", "Boolean",
  "Date", "DateTime", "LocalDateTime", "LocalTime", "Time", "Duration", "Point",
)

export class ScalarType extends Schema.TaggedClass<ScalarType>()("ScalarType", {
  scalarType: ScalarTypeLiteral,
}) {}

export class NodeType extends Schema.TaggedClass<NodeType>()("NodeType", {
  label: Schema.String,
}) {}

export class UnknownType extends Schema.TaggedClass<UnknownType>()("UnknownType", {}) {}

// ── Recursive types (interface-first to break circularity) ──

export interface ListType {
  readonly _tag: "ListType"
  readonly element: CypherType
}

export interface MapField {
  readonly name: string
  readonly value: CypherType
}

export interface MapType {
  readonly _tag: "MapType"
  readonly fields: ReadonlyArray<MapField>
}

export interface NullableType {
  readonly _tag: "NullableType"
  readonly inner: CypherType
}

export type CypherType = ScalarType | ListType | MapType | NullableType | NodeType | UnknownType

// ── Constructors for recursive variants ──

export const ListType = (element: CypherType): ListType => ({
  _tag: "ListType" as const,
  element,
})

export const MapType = (fields: ReadonlyArray<MapField>): MapType => ({
  _tag: "MapType" as const,
  fields,
})

export const NullableType = (inner: CypherType): NullableType => ({
  _tag: "NullableType" as const,
  inner,
})

// ── Schema (for encode/decode if needed) ──

const CypherTypeSchema: Schema.Schema<CypherType> = Schema.Union(
  ScalarType,
  Schema.Struct({
    _tag: Schema.Literal("ListType"),
    element: Schema.suspend((): Schema.Schema<CypherType> => CypherTypeSchema),
  }),
  Schema.Struct({
    _tag: Schema.Literal("MapType"),
    fields: Schema.Array(Schema.Struct({
      name: Schema.String,
      value: Schema.suspend((): Schema.Schema<CypherType> => CypherTypeSchema),
    })),
  }),
  Schema.Struct({
    _tag: Schema.Literal("NullableType"),
    inner: Schema.suspend((): Schema.Schema<CypherType> => CypherTypeSchema),
  }),
  NodeType,
  UnknownType,
)
export { CypherTypeSchema }
