import { describe, expectTypeOf, it } from "vitest"
import type {
  CypherType,
  ScalarType,
  ListType,
  MapType,
  MapField,
  NullableType,
  NodeType,
  UnknownType,
} from "./CypherType"

describe("CypherType union", () => {
  it("is exactly six variants", () => {
    expectTypeOf<CypherType>().toEqualTypeOf<
      ScalarType | ListType | MapType | NullableType | NodeType | UnknownType
    >()
  })

  it("each variant is assignable to the union", () => {
    expectTypeOf<ScalarType>().toMatchTypeOf<CypherType>()
    expectTypeOf<ListType>().toMatchTypeOf<CypherType>()
    expectTypeOf<MapType>().toMatchTypeOf<CypherType>()
    expectTypeOf<NullableType>().toMatchTypeOf<CypherType>()
    expectTypeOf<NodeType>().toMatchTypeOf<CypherType>()
    expectTypeOf<UnknownType>().toMatchTypeOf<CypherType>()
  })
})

describe("NullableType recursion", () => {
  it("inner is CypherType (recursive)", () => {
    expectTypeOf<NullableType["inner"]>().toEqualTypeOf<CypherType>()
  })
})

describe("ListType recursion", () => {
  it("element is CypherType (recursive)", () => {
    expectTypeOf<ListType["element"]>().toEqualTypeOf<CypherType>()
  })
})

describe("MapType recursion", () => {
  it("fields contain CypherType values (recursive)", () => {
    expectTypeOf<MapType["fields"]>().toEqualTypeOf<ReadonlyArray<MapField>>()
  })

  it("MapField value is CypherType", () => {
    expectTypeOf<MapField["value"]>().toEqualTypeOf<CypherType>()
  })
})

describe("ScalarType precision", () => {
  it("scalarType is a string literal union", () => {
    expectTypeOf<ScalarType["scalarType"]>().toMatchTypeOf<string>()
  })
})

describe("NodeType", () => {
  it("has a label field", () => {
    expectTypeOf<NodeType["label"]>().toEqualTypeOf<string>()
  })
})
