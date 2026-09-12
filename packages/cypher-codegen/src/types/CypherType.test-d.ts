import { describe, expectTypeOf, it } from "vitest"
import type {
  CypherType,
  EdgeType,
  ListType,
  LiteralType,
  MapField,
  MapType,
  NeverType,
  NullableType,
  ScalarType,
  UnknownType,
  VertexType,
  VertexUnionType
} from "./CypherType.js"

describe("CypherType union", () => {
  it("is exactly ten variants", () => {
    expectTypeOf<CypherType>().toEqualTypeOf<
      | ScalarType
      | LiteralType
      | ListType
      | MapType
      | NullableType
      | VertexType
      | VertexUnionType
      | EdgeType
      | UnknownType
      | NeverType
    >()
  })

  it("each variant is assignable to the union", () => {
    expectTypeOf<ScalarType>().toMatchTypeOf<CypherType>()
    expectTypeOf<LiteralType>().toMatchTypeOf<CypherType>()
    expectTypeOf<ListType>().toMatchTypeOf<CypherType>()
    expectTypeOf<MapType>().toMatchTypeOf<CypherType>()
    expectTypeOf<NullableType>().toMatchTypeOf<CypherType>()
    expectTypeOf<VertexType>().toMatchTypeOf<CypherType>()
    expectTypeOf<VertexUnionType>().toMatchTypeOf<CypherType>()
    expectTypeOf<EdgeType>().toMatchTypeOf<CypherType>()
    expectTypeOf<UnknownType>().toMatchTypeOf<CypherType>()
    expectTypeOf<NeverType>().toMatchTypeOf<CypherType>()
  })
})

describe("EdgeType", () => {
  it("has an edgeType field", () => {
    expectTypeOf<EdgeType["edgeType"]>().toEqualTypeOf<string>()
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

describe("LiteralType", () => {
  it("has a values field", () => {
    expectTypeOf<LiteralType["values"]>().toEqualTypeOf<ReadonlyArray<string>>()
  })
})

describe("VertexType", () => {
  it("has a label field", () => {
    expectTypeOf<VertexType["label"]>().toEqualTypeOf<string>()
  })
})

describe("VertexUnionType", () => {
  it("has a labels field", () => {
    expectTypeOf<VertexUnionType["labels"]>().toEqualTypeOf<ReadonlyArray<string>>()
  })
})
