import { Array, Equal, HashMap, Option, Order, Record, Result } from "effect"
import { EdgeSlot } from "../EdgeSlot.js"
import { SchemaConflict } from "../SchemaConflict.js"

/** @internal */
export const unionIfAgreeing =
  <K, V>(theirs: HashMap.HashMap<K, V>) => (mine: HashMap.HashMap<K, V>): Option.Option<HashMap.HashMap<K, V>> =>
    HashMap.some(mine, (value, key) => Option.exists(HashMap.get(theirs, key), (other) => !Equal.equals(other, value)))
      ? Option.none()
      : Option.some(HashMap.union(mine, theirs))

/** @internal */
export const compatibleUnion = <A, E>(
  fragments: ReadonlyArray<A>,
  keyOf: (fragment: A) => string,
  disagreement: (group: Array.NonEmptyReadonlyArray<A>) => E
): ReadonlyArray<Result.Result<A, E>> =>
  Record.values(Array.groupBy(fragments, keyOf)).map((group) =>
    Array.every(group, (fragment) => Equal.equals(fragment, group[0]))
      ? Result.succeed(group[0])
      : Result.fail(disagreement(group))
  )

const conflictKey = (conflict: SchemaConflict): string =>
  SchemaConflict.match(conflict, {
    DuplicateVertexLabel: ({ label }) => `vertex ${label} is declared more than once`,
    SharedEdgeSlot: ({ edgeType, ends }) =>
      `edge ${new EdgeSlot({ edgeType, ends }).key()} is declared by more than one module`,
    ConflictingEdgeFields: ({ edgeType, ends }) =>
      `edge ${new EdgeSlot({ edgeType, ends }).key()} is declared with differing fields`,
    ConflictingFullTextFields: ({ index }) => `fulltext index ${index} is declared over differing fields`,
    ConflictingEdgePropertyTypes: ({ edgeType, property }) =>
      `edge ${edgeType} property ${property} has differing Neo4j types across its pairs`,
    ConflictingVertexAnnotations: ({ label }) => `vertex ${label} carries differing annotations`
  })

const conflictOrder: Order.Order<SchemaConflict> = Order.mapInput(Order.String, conflictKey)

/** @internal */
export const unlessConflicting = <A>(
  conflicts: ReadonlyArray<SchemaConflict>,
  agreed: () => A
): Result.Result<A, SchemaConflict> =>
  Array.match(Array.sort(conflicts, conflictOrder), {
    onNonEmpty: ([first]) => Result.fail(first),
    onEmpty: () => Result.succeed(agreed())
  })
