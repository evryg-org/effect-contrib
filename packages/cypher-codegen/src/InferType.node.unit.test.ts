import { describe, it, expect } from "@effect/vitest"
import { inferExpressionType, type TypeEnv } from "./InferType"
import { ScalarType, ListType, MapType, NullableType, NodeType, UnknownType, type CypherType } from "./CypherType"
import { GraphSchema, NodeProperty, RelProperty } from "./SchemaExtractor"
import { CharStream, CommonTokenStream } from "antlr4ng"
import { CypherLexer } from "./generated-parser/CypherLexer.js"
import { CypherParser } from "./generated-parser/CypherParser.js"

// ── Helpers ──

const schema = new GraphSchema({
  nodeProperties: [
    new NodeProperty({ labels: ["Class"], propertyName: "fqcn", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "method_count", propertyTypes: ["Long"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "kind", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Class"], propertyName: "isStatic", propertyTypes: ["Boolean"], mandatory: false }),
    new NodeProperty({ labels: ["Class"], propertyName: "domains", propertyTypes: ["StringArray"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new NodeProperty({ labels: ["Method"], propertyName: "visibility", propertyTypes: ["String"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "params", propertyTypes: ["StringArray"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "returnType", propertyTypes: ["String"], mandatory: false }),
    new NodeProperty({ labels: ["Method"], propertyName: "ccn", propertyTypes: ["Long"], mandatory: false }),
  ],
  relProperties: [],
})

/** Parse a Cypher expression string and return the ExpressionContext */
function parseExpression(exprText: string) {
  // Wrap in a valid Cypher statement so the parser can handle it
  const cypher = `RETURN ${exprText} AS x`
  const input = CharStream.fromString(cypher)
  const lexer = new CypherLexer(input)
  const tokens = new CommonTokenStream(lexer)
  const parser = new CypherParser(tokens)
  parser.removeErrorListeners()
  const tree = parser.script()
  const returnSt = tree.query()!.regularQuery()!.singleQuery()!.singlePartQ()!.returnSt()!
  return returnSt.projectionBody()!.projectionItems()!.projectionItem(0)!.expression()!
}

const emptyEnv: TypeEnv = new Map()

function envWith(entries: Record<string, { type: CypherType; nullable: boolean }>): TypeEnv {
  return new Map(Object.entries(entries))
}

// ── Tests ──

describe("inferExpressionType — literals", () => {
  // Note: the ANTLR lexer tokenizes bare numbers and single-quoted strings as ID (symbol),
  // not as DIGIT/CHAR_LITERAL. This is a known upstream grammar issue. In practice, literals
  // appear inside function args (coalesce(x, 0)) where they work correctly.
  it.each([
    { expr: "true", expected: new ScalarType({ scalarType: "Boolean" }) },
    { expr: "false", expected: new ScalarType({ scalarType: "Boolean" }) },
    { expr: "null", expected: new UnknownType({}) },
  ])("$expr infers correctly", ({ expr, expected }) => {
    const result = inferExpressionType(parseExpression(expr), emptyEnv, schema)
    expect(result).toEqual(expected)
  })
})

describe("inferExpressionType — variable lookup", () => {
  it("looks up bare variable from type environment", () => {
    const env = envWith({ total: { type: new ScalarType({ scalarType: "Long" }), nullable: false } })
    const result = inferExpressionType(parseExpression("total"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })

  it("returns UnknownType for unbound variable", () => {
    const result = inferExpressionType(parseExpression("nonexistent"), emptyEnv, schema)
    expect(result).toEqual(new UnknownType({}))
  })
})

describe("inferExpressionType — property access", () => {
  it("resolves node property from schema", () => {
    const env = envWith({ c: { type: new NodeType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("c.fqcn"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })

  it("resolves Long property from schema", () => {
    const env = envWith({ c: { type: new NodeType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("c.method_count"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })

  it("returns UnknownType for unknown property", () => {
    const env = envWith({ c: { type: new NodeType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("c.nonexistent"), env, schema)
    expect(result).toEqual(new UnknownType({}))
  })
})

describe("inferExpressionType — aggregate functions", () => {
  it.each([
    { expr: "count(*)", expected: new ScalarType({ scalarType: "Long" }) },
    { expr: "sum(x)", expected: new ScalarType({ scalarType: "Long" }) },
    { expr: "avg(x)", expected: new ScalarType({ scalarType: "Double" }) },
  ])("$expr infers correctly", ({ expr, expected }) => {
    const env = envWith({ x: { type: new ScalarType({ scalarType: "Long" }), nullable: false } })
    const result = inferExpressionType(parseExpression(expr), env, schema)
    expect(result).toEqual(expected)
  })
})

describe("inferExpressionType — collect", () => {
  it("collect(scalar) returns ListType(scalar)", () => {
    const env = envWith({ c: { type: new NodeType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("collect(c.fqcn)"), env, schema)
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })

  it("collect(map literal) returns ListType(MapType(...)) with nullable fields", () => {
    const env = envWith({
      m: { type: new NodeType({ label: "Method" }), nullable: false },
    })
    const result = inferExpressionType(
      parseExpression("collect({visibility: m.visibility, id: m.id})"),
      env,
      schema,
    )
    // visibility is mandatory: false → NullableType; id is mandatory: true → plain
    expect(result).toEqual(ListType(
      MapType([
        { name: "visibility", value: NullableType(new ScalarType({ scalarType: "String" })) },
        { name: "id", value: new ScalarType({ scalarType: "String" }) },
      ]),
    ))
  })
})

describe("inferExpressionType — coalesce", () => {
  it("returns type of first argument", () => {
    const env = envWith({ c: { type: new NodeType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("coalesce(c.method_count, 0)"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })
})

describe("inferExpressionType — size", () => {
  it("size() returns Long", () => {
    const env = envWith({ c: { type: new NodeType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("size(c.domains)"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })
})

describe("inferExpressionType — map literal", () => {
  it("infers field types recursively with nullability", () => {
    const env = envWith({
      m: { type: new NodeType({ label: "Method" }), nullable: false },
    })
    const result = inferExpressionType(
      parseExpression("{name: m.id, vis: m.visibility}"),
      env,
      schema,
    )
    // id is mandatory: true, visibility is mandatory: false
    expect(result).toEqual(MapType([
      { name: "name", value: new ScalarType({ scalarType: "String" }) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) },
    ]))
  })
})

describe("inferExpressionType — CASE expression", () => {
  it("infers type from THEN branch", () => {
    const env = envWith({
      m: { type: new NodeType({ label: "Method" }), nullable: false },
    })
    const result = inferExpressionType(
      parseExpression("CASE WHEN m.id IS NOT NULL THEN m.id ELSE 'unknown' END"),
      env,
      schema,
    )
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })
})

describe("inferExpressionType — comparison and boolean", () => {
  it("IS NOT NULL returns Boolean", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(parseExpression("m.returnType IS NOT NULL"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "Boolean" }))
  })
})

describe("inferExpressionType — nested collect with CASE and map", () => {
  it("handles the ClassProfiles pattern: collect(CASE WHEN ... THEN {map} END)", () => {
    const env = envWith({
      m: { type: new NodeType({ label: "Method" }), nullable: false },
    })
    const result = inferExpressionType(
      parseExpression("collect(CASE WHEN m IS NOT NULL THEN {visibility: m.visibility, id: m.id} END)"),
      env,
      schema,
    )
    expect(result).toEqual(ListType(
      MapType([
        { name: "visibility", value: NullableType(new ScalarType({ scalarType: "String" })) },
        { name: "id", value: new ScalarType({ scalarType: "String" }) },
      ]),
    ))
  })
})

describe("inferExpressionType — nullable property access", () => {
  it("non-mandatory property wraps in NullableType", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(parseExpression("m.visibility"), env, schema)
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })

  it("mandatory property does NOT wrap in NullableType", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(parseExpression("m.id"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })

  it("map literal with nullable field has NullableType value", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("{id: m.id, ccn: m.ccn}"),
      env,
      schema,
    )
    expect(result).toEqual(MapType([
      { name: "id", value: new ScalarType({ scalarType: "String" }) },
      { name: "ccn", value: NullableType(new ScalarType({ scalarType: "Long" })) },
    ]))
  })
})

describe("inferExpressionType — property access on nullable variable", () => {
  it("mandatory property on nullable variable wraps in NullableType", () => {
    const env = envWith({ mc: { type: new NodeType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(parseExpression("mc.id"), env, schema)
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })

  it("non-mandatory property on nullable variable stays NullableType", () => {
    const env = envWith({ mc: { type: new NodeType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(parseExpression("mc.visibility"), env, schema)
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })

  it("map literal with nullable variable makes all fields nullable", () => {
    const env = envWith({ mc: { type: new NodeType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("{id: mc.id, vis: mc.visibility}"),
      env,
      schema,
    )
    expect(result).toEqual(MapType([
      { name: "id", value: NullableType(new ScalarType({ scalarType: "String" })) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) },
    ]))
  })

  it("collect(map) with nullable variable wraps mandatory fields", () => {
    const env = envWith({ mc: { type: new NodeType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("collect({id: mc.id, vis: mc.visibility})"),
      env,
      schema,
    )
    expect(result).toEqual(ListType(MapType([
      { name: "id", value: NullableType(new ScalarType({ scalarType: "String" })) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) },
    ])))
  })
})

describe("inferExpressionType — CASE WHEN IS NOT NULL narrowing", () => {
  it("narrows nullable variable in THEN branch", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("CASE WHEN m IS NOT NULL THEN m.id END"),
      env,
      schema,
    )
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })

  it("narrows nullable variable in map literal", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("CASE WHEN m IS NOT NULL THEN {id: m.id, vis: m.visibility} END"),
      env,
      schema,
    )
    // id: mandatory + narrowed → non-null; vis: non-mandatory → still nullable
    expect(result).toEqual(MapType([
      { name: "id", value: new ScalarType({ scalarType: "String" }) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) },
    ]))
  })

  it("does not narrow without IS NOT NULL", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("CASE WHEN true THEN m.id END"),
      env,
      schema,
    )
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })
})

describe("inferExpressionType — collect strips NullableType", () => {
  it("strips NullableType from element", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("collect(m.visibility)"),
      env,
      schema,
    )
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })

  it("non-nullable stays unchanged", () => {
    const env = envWith({ c: { type: new NodeType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("collect(c.fqcn)"),
      env,
      schema,
    )
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })
})

describe("inferExpressionType — CASE + collect combined", () => {
  it("collect(CASE WHEN x IS NOT NULL THEN {map} END) narrows + collects", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("collect(CASE WHEN m IS NOT NULL THEN {id: m.id, vis: m.visibility} END)"),
      env,
      schema,
    )
    expect(result).toEqual(ListType(MapType([
      { name: "id", value: new ScalarType({ scalarType: "String" }) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) },
    ])))
  })
})

describe("inferExpressionType — string concatenation", () => {
  it("string + string infers as String", () => {
    const env = envWith({ m: { type: new NodeType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("m.id + m.id"),
      env,
      schema,
    )
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })
})
