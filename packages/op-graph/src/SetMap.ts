import { Array, HashMap, HashSet, Option, Record, Schema } from "effect"

/**
 * Commutative monoid: a set-of-strings per key, with set-union merge.
 */
export class SetMap extends Schema.Class<SetMap>("SetMap")({
  entries: Schema.HashMap(Schema.String, Schema.HashSet(Schema.String)),
}) {
  static readonly empty: SetMap = new SetMap({ entries: HashMap.empty() })

  static of(pairs: ReadonlyArray<readonly [string, string]>): SetMap {
    const grouped = Record.toEntries(Array.groupBy(pairs, ([key]) => key))
    return new SetMap({
      entries: HashMap.fromIterable(
        grouped.map(([key, group]) => [key, HashSet.fromIterable(group.map(([, value]) => value))] as const),
      ),
    })
  }

  static concatAll(...maps: ReadonlyArray<SetMap>): SetMap {
    return maps.reduce((a, b) => a.concat(b), SetMap.empty)
  }

  /** Derive a product monoid over a record of SetMaps from a list of keys. */
  static product<K extends string>(keys: ReadonlyArray<K>) {
    type P = Record<K, SetMap>
    const empty = Record.fromEntries(keys.map((k) => [k, SetMap.empty])) as P
    const concat = (a: P, b: P): P =>
      Record.fromEntries(keys.map((k) => [k, a[k].concat(b[k])])) as P
    return {
      empty,
      concat,
      concatAll: (...vals: ReadonlyArray<P>): P => vals.reduce(concat, empty),
    }
  }

  get size(): number {
    return HashMap.size(this.entries)
  }

  concat(other: SetMap): SetMap {
    const keys = HashSet.union(HashSet.fromIterable(HashMap.keys(this.entries)), HashSet.fromIterable(HashMap.keys(other.entries)))
    return new SetMap({
      entries: HashMap.fromIterable(
        Array.fromIterable(keys).map((key) => [
          key,
          HashSet.union(
            Option.getOrElse(HashMap.get(this.entries, key), () => HashSet.empty<string>()),
            Option.getOrElse(HashMap.get(other.entries, key), () => HashSet.empty<string>()),
          ),
        ] as const),
      ),
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
