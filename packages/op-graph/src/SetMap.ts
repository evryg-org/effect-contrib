/**
 * Commutative monoid: Map<string, Set<string>> with set-union merge.
 */
export type SetMap = ReadonlyMap<string, ReadonlySet<string>>

export const SetMap = {
  empty: new Map() as SetMap,

  of: (entries: ReadonlyArray<readonly [string, string]>): SetMap =>
    entries.reduce<Map<string, Set<string>>>(
      (acc, [k, v]) => acc.set(k, (acc.get(k) ?? new Set<string>()).add(v)),
      new Map(),
    ),

  concat: (a: SetMap, b: SetMap): SetMap =>
    [...b].reduce<Map<string, Set<string>>>(
      (acc, [k, vs]) =>
        acc.set(k, [...vs].reduce((s, v) => s.add(v), new Set(acc.get(k) ?? []))),
      new Map([...a].map(([k, v]) => [k, new Set(v)])),
    ),

  concatAll: (...maps: ReadonlyArray<SetMap>): SetMap =>
    maps.reduce(SetMap.concat, SetMap.empty),

  has: (m: SetMap, key: string): boolean => m.has(key),

  values: (m: SetMap, key: string): ReadonlyArray<string> =>
    [...(m.get(key) ?? [])],

  entries: (m: SetMap): ReadonlyArray<readonly [string, ReadonlySet<string>]> =>
    [...m],

  /** Derive a product monoid over a record of SetMaps from a list of keys. */
  product: <K extends string>(keys: ReadonlyArray<K>) => {
    type P = Record<K, SetMap>
    const empty = Object.fromEntries(keys.map((k) => [k, SetMap.empty])) as P
    const concat = (a: P, b: P): P =>
      Object.fromEntries(keys.map((k) => [k, SetMap.concat(a[k], b[k])])) as P
    return {
      empty,
      concat,
      concatAll: (...vals: ReadonlyArray<P>): P => vals.reduce(concat, empty),
    }
  },
}
