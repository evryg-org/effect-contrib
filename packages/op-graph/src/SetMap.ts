import { Array, HashMap, HashSet, Option, Record, Reducer, Schema, Struct } from "effect"

/**
 * Commutative monoid: a set-of-strings per key, with set-union merge.
 */
export class SetMap extends Schema.Class<SetMap>("SetMap")({
  entries: Schema.HashMap(Schema.String, Schema.HashSet(Schema.String))
}) {
  static readonly empty: SetMap = new SetMap({ entries: HashMap.empty() })

  /** The native Reducer for the set-union monoid — `concatAll` folds a list through it. */
  static readonly Reducer: Reducer.Reducer<SetMap> = Reducer.make((a, b) => a.concat(b), SetMap.empty)

  static of(pairs: ReadonlyArray<readonly [string, string]>): SetMap {
    const grouped = Record.toEntries(Array.groupBy(pairs, ([key]) => key))
    return new SetMap({
      entries: HashMap.fromIterable(
        grouped.map(([key, group]) => [key, HashSet.fromIterable(group.map(([, value]) => value))] as const)
      )
    })
  }

  static concatAll(...maps: ReadonlyArray<SetMap>): SetMap {
    return SetMap.Reducer.combineAll(maps)
  }

  /**
   * Reducer for the product monoid over a record of SetMaps keyed by a fixed key list.
   * NOT `Record.makeReducerUnion`: that reducer's identity is `{}` (no keys at all), while this
   * product's identity must map every key of `keys` to `SetMap.empty` — a different shape, so
   * `Struct.makeReducer` over a per-key `SetMap.Reducer` is the honest native match.
   */
  static makeProductReducer<K extends string>(keys: ReadonlyArray<K>): Reducer.Reducer<Record<K, SetMap>> {
    return Struct.makeReducer<Record<K, SetMap>>(Struct.Record(keys, SetMap.Reducer))
  }

  /** Derive a product monoid over a record of SetMaps from a list of keys. */
  static product<K extends string>(keys: ReadonlyArray<K>) {
    const reducer = SetMap.makeProductReducer(keys)
    return {
      empty: reducer.initialValue,
      concat: reducer.combine,
      concatAll: (...vals: ReadonlyArray<Record<K, SetMap>>): Record<K, SetMap> => reducer.combineAll(vals)
    }
  }

  get size(): number {
    return HashMap.size(this.entries)
  }

  concat(other: SetMap): SetMap {
    const keys = HashSet.union(
      HashSet.fromIterable(HashMap.keys(this.entries)),
      HashSet.fromIterable(HashMap.keys(other.entries))
    )
    return new SetMap({
      entries: HashMap.fromIterable(
        Array.fromIterable(keys).map((key) =>
          [
            key,
            HashSet.union(
              Option.getOrElse(HashMap.get(this.entries, key), () => HashSet.empty<string>()),
              Option.getOrElse(HashMap.get(other.entries, key), () => HashSet.empty<string>())
            )
          ] as const
        )
      )
    })
  }

  has(key: string): boolean {
    return HashMap.has(this.entries, key)
  }

  values(key: string): ReadonlyArray<string> {
    return Array.fromIterable(Option.getOrElse(HashMap.get(this.entries, key), () => HashSet.empty<string>()))
  }

  toEntries(): ReadonlyArray<readonly [string, ReadonlySet<string>]> {
    return HashMap.toEntries(this.entries).map(([key, values]) => [key, new Set(values)] as const)
  }
}
