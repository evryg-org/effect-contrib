import { Array, Record } from "effect"

/**
 * Commutative monoid: Map<string, Set<string>> with set-union merge.
 */
export type SetMap = ReadonlyMap<string, ReadonlySet<string>>

export const SetMap = {
  empty: new Map() as SetMap,

  of: (entries: ReadonlyArray<readonly [string, string]>): SetMap =>
    new Map(
      Record.toEntries(Array.groupBy(entries, ([k]) => k)).map(
        ([k, pairs]) => [k, new Set(pairs.map(([, v]) => v))] as const,
      ),
    ),

  concat: ({ a, b }: { readonly a: SetMap; readonly b: SetMap }): SetMap => {
    const keys = Array.union([...a].map(([k]) => k), [...b].map(([k]) => k))
    return new Map(
      keys.map((k) => [k, new Set([...(a.get(k) ?? []), ...(b.get(k) ?? [])])] as const),
    )
  },

  concatAll: (...maps: ReadonlyArray<SetMap>): SetMap =>
    maps.reduce((a, b) => SetMap.concat({ a, b }), SetMap.empty),

  has: (m: SetMap, key: string): boolean => m.has(key),

  values: (m: SetMap, key: string): ReadonlyArray<string> =>
    [...(m.get(key) ?? [])],

  entries: (m: SetMap): ReadonlyArray<readonly [string, ReadonlySet<string>]> =>
    [...m],

  /** Derive a product monoid over a record of SetMaps from a list of keys. */
  product: <K extends string>(keys: ReadonlyArray<K>) => {
    type P = Record<K, SetMap>
    const empty = Record.fromEntries(keys.map((k) => [k, SetMap.empty])) as P
    const concat = (a: P, b: P): P =>
      Record.fromEntries(keys.map((k) => [k, SetMap.concat({ a: a[k], b: b[k] })])) as P
    return {
      empty,
      concat,
      concatAll: (...vals: ReadonlyArray<P>): P => vals.reduce(concat, empty),
    }
  },
}
