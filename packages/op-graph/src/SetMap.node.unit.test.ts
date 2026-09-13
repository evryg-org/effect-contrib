import { Array, Equal, Order } from "effect"
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
    expect(new Set(m.values("a"))).toEqual(new Set(["1", "2"]))
    expect(new Set(m.values("b"))).toEqual(new Set(["3"]))
  })

  it("of with no entries returns empty", () => {
    const m = SetMap.of([])
    expect(m.size).toBe(0)
  })

  it("concat merges with set-union semantics", () => {
    const a = SetMap.of([["x", "1"], ["x", "2"]])
    const b = SetMap.of([["x", "2"], ["x", "3"], ["y", "4"]])
    const c = a.concat(b)
    expect(new Set(c.values("x"))).toEqual(new Set(["1", "2", "3"]))
    expect(new Set(c.values("y"))).toEqual(new Set(["4"]))
  })

  it("concat is commutative (same elements, order may differ)", () => {
    const a = SetMap.of([["k", "a"], ["k", "b"]])
    const b = SetMap.of([["k", "b"], ["k", "c"]])
    const ab = a.concat(b)
    const ba = b.concat(a)
    expect(new Set(ab.values("k"))).toEqual(new Set(ba.values("k")))
  })

  it("concat with empty is identity", () => {
    const m = SetMap.of([["a", "1"]])
    expect(Equal.equals(m.concat(SetMap.empty), m)).toBe(true)
    expect(Equal.equals(SetMap.empty.concat(m), m)).toBe(true)
  })

  it("concatAll merges multiple maps", () => {
    const a = SetMap.of([["k", "1"]])
    const b = SetMap.of([["k", "2"]])
    const c = SetMap.of([["k", "3"], ["j", "x"]])
    const result = SetMap.concatAll(a, b, c)
    expect(new Set(result.values("k"))).toEqual(new Set(["1", "2", "3"]))
    expect(new Set(result.values("j"))).toEqual(new Set(["x"]))
  })

  it("has returns true for existing keys", () => {
    const m = SetMap.of([["a", "1"]])
    expect(m.has("a")).toBe(true)
    expect(m.has("b")).toBe(false)
  })

  it("values returns empty array for missing key", () => {
    expect(SetMap.empty.values("x")).toEqual([])
  })

  it("entries returns all key-set pairs", () => {
    const m = SetMap.of([["a", "1"], ["b", "2"], ["a", "3"]])
    const e = m.toEntries()
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
      expect(new Set(c.x.values("k"))).toEqual(new Set(["1", "2"]))
      expect(new Set(c.y.values("k"))).toEqual(new Set(["a"]))
      expect(new Set(c.y.values("j"))).toEqual(new Set(["b"]))
    })

    it("concatAll merges multiple products", () => {
      const a = { x: SetMap.of([["k", "1"]]), y: SetMap.empty }
      const b = { x: SetMap.empty, y: SetMap.of([["k", "a"]]) }
      const c = { x: SetMap.of([["k", "2"]]), y: SetMap.of([["k", "b"]]) }
      const result = P.concatAll(a, b, c)
      expect(new Set(result.x.values("k"))).toEqual(new Set(["1", "2"]))
      expect(new Set(result.y.values("k"))).toEqual(new Set(["a", "b"]))
    })
  })
})
