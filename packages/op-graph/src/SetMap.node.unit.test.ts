import { Array, Order } from "effect"
import { describe, it, expect } from "@effect/vitest"
import { SetMap } from "./SetMap.js"

describe("SetMap", () => {
  it("empty is an empty map", () => {
    expect(SetMap.empty.size).toBe(0)
  })

  it("of builds from key-value pairs with dedup", () => {
    const m = SetMap.of([
      ["a", "1"],
      ["a", "2"],
      ["a", "1"],
      ["b", "3"],
    ])
    expect(SetMap.values(m, "a")).toEqual(["1", "2"])
    expect(SetMap.values(m, "b")).toEqual(["3"])
  })

  it("of with no entries returns empty", () => {
    const m = SetMap.of([])
    expect(m.size).toBe(0)
  })

  it("concat merges with set-union semantics", () => {
    const a = SetMap.of([["x", "1"], ["x", "2"]])
    const b = SetMap.of([["x", "2"], ["x", "3"], ["y", "4"]])
    const c = SetMap.concat({ a, b })
    expect(SetMap.values(c, "x")).toEqual(["1", "2", "3"])
    expect(SetMap.values(c, "y")).toEqual(["4"])
  })

  it("concat is commutative (same elements, order may differ)", () => {
    const a = SetMap.of([["k", "a"], ["k", "b"]])
    const b = SetMap.of([["k", "b"], ["k", "c"]])
    const ab = SetMap.concat({ a, b })
    const ba = SetMap.concat({ a: b, b: a })
    expect(new Set(SetMap.values(ab, "k"))).toEqual(new Set(SetMap.values(ba, "k")))
  })

  it("concat with empty is identity", () => {
    const m = SetMap.of([["a", "1"]])
    expect(SetMap.concat({ a: m, b: SetMap.empty })).toEqual(m)
    expect(SetMap.concat({ a: SetMap.empty, b: m })).toEqual(m)
  })

  it("concatAll merges multiple maps", () => {
    const a = SetMap.of([["k", "1"]])
    const b = SetMap.of([["k", "2"]])
    const c = SetMap.of([["k", "3"], ["j", "x"]])
    const result = SetMap.concatAll(a, b, c)
    expect(SetMap.values(result, "k")).toEqual(["1", "2", "3"])
    expect(SetMap.values(result, "j")).toEqual(["x"])
  })

  it("has returns true for existing keys", () => {
    const m = SetMap.of([["a", "1"]])
    expect(SetMap.has(m, "a")).toBe(true)
    expect(SetMap.has(m, "b")).toBe(false)
  })

  it("values returns empty array for missing key", () => {
    expect(SetMap.values(SetMap.empty, "x")).toEqual([])
  })

  it("entries returns all key-set pairs", () => {
    const m = SetMap.of([["a", "1"], ["b", "2"], ["a", "3"]])
    const e = SetMap.entries(m)
    expect(e.length).toBe(2)
    expect(Array.sort(e.map(([k]) => k), Order.String)).toEqual(["a", "b"])
  })

  describe("product", () => {
    const P = SetMap.product(["x", "y"] as const)

    it("empty has empty SetMaps for each key", () => {
      expect(P.empty.x.size).toBe(0)
      expect(P.empty.y.size).toBe(0)
    })

    it("concat merges each component independently", () => {
      const a = { x: SetMap.of([["k", "1"]]), y: SetMap.of([["k", "a"]]) }
      const b = { x: SetMap.of([["k", "2"]]), y: SetMap.of([["j", "b"]]) }
      const c = P.concat(a, b)
      expect(SetMap.values(c.x, "k")).toEqual(["1", "2"])
      expect(SetMap.values(c.y, "k")).toEqual(["a"])
      expect(SetMap.values(c.y, "j")).toEqual(["b"])
    })

    it("concatAll merges multiple products", () => {
      const a = { x: SetMap.of([["k", "1"]]), y: SetMap.empty }
      const b = { x: SetMap.empty, y: SetMap.of([["k", "a"]]) }
      const c = { x: SetMap.of([["k", "2"]]), y: SetMap.of([["k", "b"]]) }
      const result = P.concatAll(a, b, c)
      expect(SetMap.values(result.x, "k")).toEqual(["1", "2"])
      expect(SetMap.values(result.y, "k")).toEqual(["a", "b"])
    })
  })
})
