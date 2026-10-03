/**
 * @since 0.5.0
 */
import type { Types } from "effect"
import { Schema } from "effect"
import { neo4jVertex } from "./Neo4jSchemaAnnotations.js"

// ── Branded error for field-name collisions ──

declare const ShadowedFieldErrorId: unique symbol

/**
 * Substituted for the type of an own field whose name collides with a field
 * already introduced by `partition`, `key` or `properties`. A real field
 * schema never structurally matches this brand, so a colliding literal fails
 * to typecheck instead of silently shadowing the group's field.
 */
interface ShadowedFieldError<Name extends string> {
  readonly [ShadowedFieldErrorId]:
    `neo4jVertexStruct: field "${Name}" is already declared by partition, key or properties`
}

type NoShadow<Fields extends Schema.Struct.Fields, Shadowed extends PropertyKey> = {
  readonly [K in Extract<keyof Fields, Shadowed>]: ShadowedFieldError<K & string>
}

declare const OverlappingGroupFieldErrorId: unique symbol

/**
 * Demanded of `fields` under the name of a field that two of `partition`,
 * `key` and `properties` both declare. The own fields never provide it, so
 * the overlap fails to typecheck instead of one group silently replacing the
 * other's field in the merged struct.
 */
interface OverlappingGroupFieldError<Name extends string> {
  readonly [OverlappingGroupFieldErrorId]:
    `neo4jVertexStruct: field "${Name}" is declared by more than one of partition, key and properties`
}

type DisjointGroups<
  PartitionFields extends Schema.Struct.Fields,
  KeyFields extends Schema.Struct.Fields,
  PropertiesFields extends Schema.Struct.Fields
> = {
  readonly [
    K in
      & (
        | Extract<keyof KeyFields, keyof PartitionFields>
        | Extract<keyof PropertiesFields, keyof PartitionFields | keyof KeyFields>
      )
      & string
  ]: OverlappingGroupFieldError<K>
}

// ── Branded error for optional/nullable key members ──

declare const OptionalKeyFieldErrorId: unique symbol

/**
 * Substituted for the type of a partition or key group field that is
 * optional or nullable. A key member must be present and non-null on every
 * vertex, so a field whose key is optional or whose type admits `undefined`
 * or `null` fails to typecheck as a key member instead of silently weakening
 * the identity constraint.
 */
interface OptionalKeyFieldError<Name extends string> {
  readonly [OptionalKeyFieldErrorId]:
    `neo4jVertexStruct: field "${Name}" cannot be a key member — key fields must be required and non-nullable`
}

/**
 * The names of `Fields` whose schemas may name a key member: required keys
 * whose type admits neither `undefined` nor `null`. Optional and nullable
 * fields are excluded, because a vertex missing a key member breaks the
 * totality of the partition's equivalence relation and escapes Neo4j's
 * composite `IS UNIQUE` constraint (which binds only nodes that possess all
 * constrained properties).
 *
 * It is the element type of `ownKey`, so a constructor that is generic over
 * a vertex's own fields can name the key it forwards to
 * {@link neo4jVertexStruct}.
 *
 * @since 0.7.0
 * @category models
 */
export type KeyEligibleFieldName<Fields extends Schema.Struct.Fields> =
  & {
    [K in keyof Fields]: Fields[K]["~type.optionality"] extends "optional" ? never
      : undefined extends Fields[K]["Type"] ? never
      : null extends Fields[K]["Type"] ? never
      : K
  }[keyof Fields]
  & string

type NoOptionalKeyFields<Fields extends Schema.Struct.Fields> = {
  readonly [K in Exclude<keyof Fields, KeyEligibleFieldName<Fields>> & string]: OptionalKeyFieldError<K>
}

// ── Groups ──

/**
 * An ordered, reusable group of properties that partitions the vertex set
 * and prefixes a vertex's composite key.
 *
 * **Why "partition" is the right word.** Projecting each vertex onto this
 * group's fields sends it to a tuple of key values. Because every field in
 * the group must be required and non-nullable — optional and nullable
 * fields are rejected at the type level — that projection is total, so
 * "same tuple" is an equivalence relation on the vertex set: its blocks are
 * pairwise disjoint, they cover the vertex set, and the projection is, up
 * to the canonical bijection between tuples and blocks, the quotient map
 * onto them. Cross-block edges form the cut induced by the partition. That
 * is graph partitioning in the mathematical sense — a statement about
 * vertex identity, not physical placement: it neither requests nor implies
 * that the store co-locates a block's vertices, unlike the storage-level
 * features that share the name (e.g. JanusGraph's explicit graph
 * partitioning, or the Cassandra partition key behind DSE Graph's
 * `partitionBy`).
 *
 * Note that the full composite key
 * `[...partition fields, ...key group fields, ...ownKey]` plays a different
 * role: under a uniqueness constraint it is injective, so the block
 * structure comes from this prefix alone — the suffix after it (a
 * {@link KeyGroup} and/or `ownKey`) refines each block down to individual
 * vertices.
 *
 * There is no `order` option: the key order IS `fields`' declaration order,
 * so there is no second statement of order that could disagree with the
 * first.
 *
 * @since 0.5.0
 * @category models
 */
export interface Partition<Fields extends Schema.Struct.Fields> {
  readonly fields: Fields
  readonly keyFields: ReadonlyArray<keyof Fields & string>
}

/**
 * A reusable group of properties that carries no order, so nothing in this
 * module can read a key contribution out of it. Use this for fields that
 * belong on the vertex but never participate in its composite key.
 *
 * @since 0.5.0
 * @category models
 */
export interface Properties<Fields extends Schema.Struct.Fields> {
  readonly fields: Fields
}

const KeyGroupTypeId: unique symbol = Symbol.for("@evryg/effect-neo4j-schema/KeyGroup")

/**
 * An ordered, reusable group of a vertex's own key fields, declared once and
 * shared by every schema that keys the vertex by them. In the composite key
 * it follows the partition and precedes `ownKey`, so it refines each
 * partition block towards individual vertices instead of partitioning the
 * vertex set itself.
 *
 * Only {@link neo4jKeyGroup} builds one: the group is branded, so its members
 * are always the required, non-nullable fields that constructor checked.
 * That check travels with the value, which lets a constructor generic over a
 * vertex's fields key the vertex by a group it receives, where it could not
 * prove an `ownKey` over its type parameters.
 *
 * The key order IS `fields`' declaration order, as for {@link Partition}.
 *
 * @since 0.7.0
 * @category models
 */
export interface KeyGroup<Fields extends Schema.Struct.Fields> {
  readonly [KeyGroupTypeId]: typeof KeyGroupTypeId
  readonly fields: Fields
  readonly keyFields: ReadonlyArray<keyof Fields & string>
}

/**
 * Declare an ordered, reusable group of properties that partitions the
 * vertex set and prefixes a vertex's composite key. See {@link Partition}
 * for why "partition" is the precise word for this concept.
 *
 * Every field in the group must be required and non-nullable; an optional or
 * nullable field is rejected at the type level. The schema layer has to
 * enforce this because the emitted DDL alone cannot: Neo4j's composite
 * `IS UNIQUE` constraint binds only nodes that possess all constrained
 * properties (property existence is a separate `NODE KEY` concern), and a
 * Cypher `MERGE` on a key with a null member is a runtime error — so an
 * optional key member would silently exempt vertices from the identity
 * constraint instead of participating in it.
 *
 * @since 0.5.0
 * @category constructors
 */
export const neo4jPartition = <const Fields extends Schema.Struct.Fields>(
  fields: Fields & NoOptionalKeyFields<Fields>
): Partition<Fields> => ({
  fields,
  keyFields: Object.keys(fields) as ReadonlyArray<keyof Fields & string>
})

/**
 * Declare an ordered, reusable group of a vertex's own key fields. See
 * {@link KeyGroup}.
 *
 * Every field in the group must be required and non-nullable; an optional or
 * nullable field is rejected at the type level, for the same reason
 * {@link neo4jPartition} rejects one.
 *
 * @since 0.7.0
 * @category constructors
 */
export const neo4jKeyGroup = <const Fields extends Schema.Struct.Fields>(
  fields: Fields & NoOptionalKeyFields<Fields>
): KeyGroup<Fields> => ({
  [KeyGroupTypeId]: KeyGroupTypeId,
  fields,
  keyFields: Object.keys(fields) as ReadonlyArray<keyof Fields & string>
})

/**
 * Declare a reusable group of properties that carries no order and never
 * contributes to a composite key. See {@link Properties}.
 *
 * @since 0.5.0
 * @category constructors
 */
export const neo4jProperties = <const Fields extends Schema.Struct.Fields>(
  fields: Fields
): Properties<Fields> => ({ fields })

// ── Vertex struct ──

type MergedFieldName<
  OwnFields extends Schema.Struct.Fields,
  PartitionFields extends Schema.Struct.Fields,
  PropertiesFields extends Schema.Struct.Fields,
  KeyFields extends Schema.Struct.Fields
> = (keyof OwnFields | keyof PartitionFields | keyof PropertiesFields | keyof KeyFields) & string

/**
 * The vertex's key, modeled as a union so "unique but nothing to be unique
 * on" cannot be constructed:
 * - A key exists once a `partition`, a `key` group and/or a non-empty
 *   `ownKey` is given, and it defaults to `mode: "unique"` when `mode` is
 *   omitted. Unique is the default on purpose: a migrator who forgets
 *   `mode` must land on the stronger guarantee, never silently on a weaker
 *   one — 34 of the 36 real vertices this module was built for use a unique
 *   composite key, only 2 use a plain index.
 * - `mode: "index"` is the explicit opt-out into a plain composite index;
 *   `partition`/`key`/`ownKey` stay optional there.
 * - With no `partition`, no `key` and no `ownKey`, there is no key at all, so
 *   `mode` must be absent — `mode: "unique"` naming nothing to be unique on
 *   is exactly the illegal state this union forbids.
 *
 * `ownKey` members must be required, non-nullable fields — an optional or
 * nullable field is not nameable in a key, for the same reason
 * {@link neo4jPartition} rejects one as a partition member.
 */
type VertexKey<
  OwnFields extends Schema.Struct.Fields,
  PartitionFields extends Schema.Struct.Fields,
  KeyFields extends Schema.Struct.Fields
> =
  | {
    readonly mode?: "unique"
    readonly partition: Partition<PartitionFields>
    readonly key?: KeyGroup<KeyFields>
    readonly ownKey?: ReadonlyArray<KeyEligibleFieldName<OwnFields>>
  }
  | {
    readonly mode?: "unique"
    readonly partition?: undefined
    readonly key: KeyGroup<KeyFields>
    readonly ownKey?: ReadonlyArray<KeyEligibleFieldName<OwnFields>>
  }
  | {
    readonly mode?: "unique"
    readonly partition?: undefined
    readonly key?: undefined
    readonly ownKey: readonly [KeyEligibleFieldName<OwnFields>, ...ReadonlyArray<KeyEligibleFieldName<OwnFields>>]
  }
  | {
    readonly mode: "index"
    readonly partition?: Partition<PartitionFields>
    readonly key?: KeyGroup<KeyFields>
    readonly ownKey?: ReadonlyArray<KeyEligibleFieldName<OwnFields>>
  }
  | {
    readonly mode?: undefined
    readonly partition?: undefined
    readonly key?: undefined
    readonly ownKey?: undefined
  }

interface VertexStructCommonOptions<
  OwnFields extends Schema.Struct.Fields,
  PartitionFields extends Schema.Struct.Fields,
  PropertiesFields extends Schema.Struct.Fields,
  KeyFields extends Schema.Struct.Fields
> {
  /** A non-key, unordered group of properties merged onto the vertex. */
  readonly properties?: Properties<PropertiesFields>
  /**
   * The vertex's own fields. A name already introduced by `partition`, `key`
   * or `properties` is rejected at the type level: the colliding property's
   * required type becomes an unsatisfiable branded error type, so the
   * collision fails to typecheck instead of silently shadowing the group's
   * field.
   *
   * This type also carries the check that `partition`, `key` and
   * `properties` declare disjoint fields. A constructor that forwards
   * `fields` unchanged therefore forwards every collision check with it.
   */
  readonly fields:
    & OwnFields
    & NoShadow<OwnFields, Types.NoInfer<keyof PartitionFields | keyof PropertiesFields | keyof KeyFields>>
    & Types.NoInfer<DisjointGroups<PartitionFields, KeyFields, PropertiesFields>>
  /**
   * Composite indexes independent of the vertex's own key. When `mode` and a
   * key are also present, the key-derived index (if any) is emitted first,
   * followed by these, in declaration order.
   */
  readonly compositeIndexes?: ReadonlyArray<
    ReadonlyArray<Types.NoInfer<MergedFieldName<OwnFields, PartitionFields, PropertiesFields, KeyFields>>>
  >
  /** Passed straight through to {@link neo4jVertex}'s `fullTextIndexes`. */
  readonly fullTextIndexes?: ReadonlyArray<{
    readonly name: string
    readonly fields: ReadonlyArray<
      Types.NoInfer<MergedFieldName<OwnFields, PartitionFields, PropertiesFields, KeyFields>>
    >
  }>
}

/**
 * The options {@link neo4jVertexStruct} takes, named so a constructor built on
 * it can accept them and forward them unchanged. The key-shape union and the
 * collision checks carried by `fields` travel with the type.
 *
 * @since 0.7.0
 * @category models
 */
export type VertexStructOptions<
  OwnFields extends Schema.Struct.Fields,
  PartitionFields extends Schema.Struct.Fields = {},
  PropertiesFields extends Schema.Struct.Fields = {},
  KeyFields extends Schema.Struct.Fields = {}
> =
  & VertexStructCommonOptions<OwnFields, PartitionFields, PropertiesFields, KeyFields>
  & VertexKey<OwnFields, PartitionFields, KeyFields>

/**
 * Build a `Schema.Struct` for a Neo4j vertex from an optional `partition`
 * (an ordered, key-contributing group), an optional `key` group (an ordered
 * group of own key fields, see {@link KeyGroup}), an optional `properties`
 * group (an unordered, non-key group), and the vertex's own `fields`, and
 * annotate it by delegating to {@link neo4jVertex} — never re-implementing
 * the annotation object — so the compiled DDL is identical to hand-writing
 * the equivalent `neo4jVertex(label, { compositeKey/compositeIndexes })`
 * call by construction.
 *
 * The merged struct's fields are `partition`'s, then `key`'s, then
 * `properties`', then the vertex's own, in that order, and the key is
 * `[...partition fields, ...key fields, ...ownKey]`. When a key exists (a
 * `partition`, a `key` and/or a non-empty `ownKey`), it defaults to
 * `mode: "unique"`; `mode: "index"` is the explicit opt-out into a plain
 * composite index instead.
 * `compositeKey`/`compositeIndexes` are omitted entirely (never emitted as
 * `[]`) when the vertex has no key, since an empty array is truthy and
 * would otherwise compile to `REQUIRE ()`.
 *
 * @since 0.5.0
 * @category constructors
 */
export const neo4jVertexStruct = <
  const OwnFields extends Schema.Struct.Fields,
  const PartitionFields extends Schema.Struct.Fields = {},
  const PropertiesFields extends Schema.Struct.Fields = {},
  const KeyFields extends Schema.Struct.Fields = {}
>(
  label: string,
  opts: VertexStructOptions<OwnFields, PartitionFields, PropertiesFields, KeyFields>
): Schema.Struct<OwnFields & PartitionFields & PropertiesFields & KeyFields> => {
  const mergedFields = {
    ...(opts.partition?.fields ?? {}),
    ...(opts.key?.fields ?? {}),
    ...(opts.properties?.fields ?? {}),
    ...opts.fields
  } as unknown as OwnFields & PartitionFields & PropertiesFields & KeyFields

  const keyFields = [...(opts.partition?.keyFields ?? []), ...(opts.key?.keyFields ?? []), ...(opts.ownKey ?? [])]
  const isIndexMode = opts.mode === "index"
  const compositeKey = !isIndexMode && keyFields.length > 0 ? keyFields : undefined

  const compositeIndexes: Array<Array<string>> = [
    ...(isIndexMode && keyFields.length > 0 ? [keyFields] : []),
    ...(opts.compositeIndexes ?? []).map((index) => [...index])
  ]

  const fullTextIndexes = opts.fullTextIndexes?.map(({ fields, name }) => ({ name, fields: [...fields] }))

  return Schema.Struct(mergedFields).annotate(
    neo4jVertex(label, {
      ...(compositeKey ? { compositeKey } : {}),
      ...(compositeIndexes.length > 0 ? { compositeIndexes } : {}),
      ...(fullTextIndexes ? { fullTextIndexes } : {})
    })
  )
}
