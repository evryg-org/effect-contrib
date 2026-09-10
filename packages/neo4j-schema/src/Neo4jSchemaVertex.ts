/**
 * @since 0.0.1
 */
import type { Types } from "effect"
import { Schema } from "effect"
import { neo4jVertex } from "./Neo4jSchemaAnnotations.js"

// ── Branded error for field-name collisions ──

declare const ShadowedFieldErrorId: unique symbol

/**
 * Substituted for the type of an own field whose name collides with a field
 * already introduced by `partition` or `properties`. A real field schema
 * never structurally matches this brand, so a colliding literal fails to
 * typecheck instead of silently shadowing the group's field.
 */
interface ShadowedFieldError<Name extends string> {
  readonly [ShadowedFieldErrorId]: `neo4jVertexStruct: field "${Name}" is already declared by partition or properties`
}

type NoShadow<Fields extends Schema.Struct.Fields, Shadowed extends PropertyKey> = {
  readonly [K in Extract<keyof Fields, Shadowed>]: ShadowedFieldError<K & string>
}

// ── Groups ──

/**
 * An ordered, reusable group of properties that partitions the vertex set
 * and prefixes a vertex's composite key.
 *
 * **Why "partition" is the right word.** An ordered key-prefix group induces
 * an equivalence relation on vertices — same prefix value, same block — and
 * the blocks it defines are pairwise disjoint and cover the vertex set, with
 * the key acting as the quotient map. Edges spanning blocks are ordinary cut
 * edges. That is graph partitioning in the mathematical sense, regardless of
 * whether the underlying store implements physical partitioning.
 *
 * There is no `order` option: the key order IS `fields`' declaration order,
 * so there is no second statement of order that could disagree with the
 * first.
 *
 * @since 0.0.1
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
 * @since 0.0.1
 * @category models
 */
export interface Properties<Fields extends Schema.Struct.Fields> {
  readonly fields: Fields
}

/**
 * Declare an ordered, reusable group of properties that partitions the
 * vertex set and prefixes a vertex's composite key. See {@link Partition}
 * for why "partition" is the precise word for this concept.
 *
 * @since 0.0.1
 * @category constructors
 */
export const neo4jPartition = <const Fields extends Schema.Struct.Fields>(
  fields: Fields
): Partition<Fields> => ({
  fields,
  keyFields: Object.keys(fields) as ReadonlyArray<keyof Fields & string>
})

/**
 * Declare a reusable group of properties that carries no order and never
 * contributes to a composite key. See {@link Properties}.
 *
 * @since 0.0.1
 * @category constructors
 */
export const neo4jProperties = <const Fields extends Schema.Struct.Fields>(
  fields: Fields
): Properties<Fields> => ({ fields })

// ── Vertex struct ──

type MergedFieldName<
  OwnFields extends Schema.Struct.Fields,
  PartitionFields extends Schema.Struct.Fields,
  PropertiesFields extends Schema.Struct.Fields
> = (keyof OwnFields | keyof PartitionFields | keyof PropertiesFields) & string

/**
 * The vertex's key, modeled as a union so "unique but nothing to be unique
 * on" cannot be constructed:
 * - A key exists once a `partition` and/or a non-empty `ownKey` is given,
 *   and it defaults to `mode: "unique"` when `mode` is omitted. Unique is
 *   the default on purpose: a migrator who forgets `mode` must land on the
 *   stronger guarantee, never silently on a weaker one — 34 of the 36 real
 *   vertices this module was built for use a unique composite key, only 2
 *   use a plain index.
 * - `mode: "index"` is the explicit opt-out into a plain composite index;
 *   `partition`/`ownKey` stay optional there.
 * - With neither a `partition` nor an `ownKey`, there is no key at all, so
 *   `mode` must be absent — `mode: "unique"` naming nothing to be unique on
 *   is exactly the illegal state this union forbids.
 */
type VertexKey<OwnFields extends Schema.Struct.Fields, PartitionFields extends Schema.Struct.Fields> =
  | {
    readonly mode?: "unique"
    readonly partition: Partition<PartitionFields>
    readonly ownKey?: ReadonlyArray<keyof OwnFields & string>
  }
  | {
    readonly mode?: "unique"
    readonly partition?: undefined
    readonly ownKey: readonly [keyof OwnFields & string, ...ReadonlyArray<keyof OwnFields & string>]
  }
  | {
    readonly mode: "index"
    readonly partition?: Partition<PartitionFields>
    readonly ownKey?: ReadonlyArray<keyof OwnFields & string>
  }
  | {
    readonly mode?: undefined
    readonly partition?: undefined
    readonly ownKey?: undefined
  }

interface VertexStructCommonOptions<
  OwnFields extends Schema.Struct.Fields,
  PartitionFields extends Schema.Struct.Fields,
  PropertiesFields extends Schema.Struct.Fields
> {
  /** A non-key, unordered group of properties merged onto the vertex. */
  readonly properties?: Properties<PropertiesFields>
  /**
   * The vertex's own fields. A name already introduced by `partition` or
   * `properties` is rejected at the type level: the colliding property's
   * required type becomes an unsatisfiable branded error type, so the
   * collision fails to typecheck instead of silently shadowing the group's
   * field.
   */
  readonly fields: OwnFields & NoShadow<OwnFields, Types.NoInfer<keyof PartitionFields | keyof PropertiesFields>>
  /**
   * Composite indexes independent of the vertex's own key. When `mode` and a
   * key are also present, the key-derived index (if any) is emitted first,
   * followed by these, in declaration order.
   */
  readonly compositeIndexes?: ReadonlyArray<
    ReadonlyArray<Types.NoInfer<MergedFieldName<OwnFields, PartitionFields, PropertiesFields>>>
  >
  /** Passed straight through to {@link neo4jVertex}'s `fullTextIndexes`. */
  readonly fullTextIndexes?: ReadonlyArray<{
    readonly name: string
    readonly fields: ReadonlyArray<Types.NoInfer<MergedFieldName<OwnFields, PartitionFields, PropertiesFields>>>
  }>
}

type VertexStructOptions<
  OwnFields extends Schema.Struct.Fields,
  PartitionFields extends Schema.Struct.Fields = {},
  PropertiesFields extends Schema.Struct.Fields = {}
> =
  & VertexStructCommonOptions<OwnFields, PartitionFields, PropertiesFields>
  & VertexKey<OwnFields, PartitionFields>

/**
 * Build a `Schema.Struct` for a Neo4j vertex from an optional `partition`
 * (an ordered, key-contributing group), an optional `properties` group (an
 * unordered, non-key group), and the vertex's own `fields`, and annotate it
 * by delegating to {@link neo4jVertex} — never re-implementing the
 * annotation object — so the compiled DDL is identical to hand-writing the
 * equivalent `neo4jVertex(label, { compositeKey/compositeIndexes })` call by
 * construction.
 *
 * The merged struct's fields are `partition`'s, then `properties`', then the
 * vertex's own, in that order. When a key exists (a `partition` and/or a
 * non-empty `ownKey`), it defaults to `mode: "unique"`; `mode: "index"` is
 * the explicit opt-out into a plain composite index instead.
 * `compositeKey`/`compositeIndexes` are omitted entirely (never emitted as
 * `[]`) when the vertex has no key, since an empty array is truthy and
 * would otherwise compile to `REQUIRE ()`.
 *
 * @since 0.0.1
 * @category constructors
 */
export const neo4jVertexStruct = <
  const OwnFields extends Schema.Struct.Fields,
  const PartitionFields extends Schema.Struct.Fields = {},
  const PropertiesFields extends Schema.Struct.Fields = {}
>(
  label: string,
  opts: VertexStructOptions<OwnFields, PartitionFields, PropertiesFields>
): Schema.Struct<OwnFields & PartitionFields & PropertiesFields> => {
  const mergedFields = {
    ...(opts.partition?.fields ?? {}),
    ...(opts.properties?.fields ?? {}),
    ...opts.fields
  } as unknown as OwnFields & PartitionFields & PropertiesFields

  const keyFields = [...(opts.partition?.keyFields ?? []), ...(opts.ownKey ?? [])]
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
