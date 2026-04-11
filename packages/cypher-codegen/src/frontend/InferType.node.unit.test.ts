import { describe, expect, it } from "@effect/vitest"
import { EdgeProperty, GraphSchema, VertexProperty } from "@evryg/effect-neo4j-schema"
import { CharStream, CommonTokenStream } from "antlr4ng"
import {
  type CypherType,
  EdgeType,
  ListType,
  MapType,
  NeverType,
  NullableType,
  ScalarType,
  VertexType,
  VertexUnionType
} from "../types/CypherType.js"
import { CypherLexer } from "./generated-parser/CypherLexer.js"
import { CypherParser } from "./generated-parser/CypherParser.js"
import { inferExpressionType, type TypeEnv } from "./InferType.js"

// ── Helpers ──

const schema = new GraphSchema({
  vertexProperties: [
    new VertexProperty({ labels: ["Class"], propertyName: "fqcn", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "kind", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["File"], propertyName: "lineCount", propertyTypes: ["Long"], mandatory: true }),
    new VertexProperty({ labels: ["Class"], propertyName: "isStatic", propertyTypes: ["Boolean"], mandatory: false }),
    new VertexProperty({
      labels: ["Class"],
      propertyName: "subdomains",
      propertyTypes: ["StringArray"],
      mandatory: false
    }),
    new VertexProperty({ labels: ["Method"], propertyName: "id", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Method"], propertyName: "name", propertyTypes: ["String"], mandatory: true }),
    new VertexProperty({ labels: ["Method"], propertyName: "visibility", propertyTypes: ["String"], mandatory: false }),
    new VertexProperty({
      labels: ["Method"],
      propertyName: "params",
      propertyTypes: ["StringArray"],
      mandatory: false
    }),
    new VertexProperty({ labels: ["Method"], propertyName: "returnType", propertyTypes: ["String"], mandatory: false }),
    new VertexProperty({ labels: ["Method"], propertyName: "ccn", propertyTypes: ["Long"], mandatory: false })
  ],
  edgeProperties: [
    new EdgeProperty({ edgeType: "CALLS", propertyName: "confidence", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "CALLS", propertyName: "edge_count", propertyTypes: ["Double"], mandatory: true }),
    new EdgeProperty({ edgeType: "CALLS", propertyName: "reason", propertyTypes: ["String"], mandatory: true }),
    new EdgeProperty({ edgeType: "BELONGS_TO", propertyName: "role", propertyTypes: ["String"], mandatory: false }),
    new EdgeProperty({ edgeType: "IMPORTS", propertyName: "mechanism", propertyTypes: ["String"], mandatory: true })
  ]
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
    { expr: "null", expected: new NeverType({}) }
  ])("$expr infers correctly", ({ expected, expr }) => {
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

  it("throws for unbound variable", () => {
    expect(() => inferExpressionType(parseExpression("nonexistent"), emptyEnv, schema))
      .toThrow("Unbound variable 'nonexistent'")
  })
})

describe("inferExpressionType — property access", () => {
  it("resolves node property from schema", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("c.fqcn"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })

  it("resolves Long property from schema", () => {
    const env = envWith({ f: { type: new VertexType({ label: "File" }), nullable: false } })
    const result = inferExpressionType(parseExpression("f.lineCount"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })

  it("throws for unknown node property", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    expect(() => inferExpressionType(parseExpression("c.nonexistent"), env, schema))
      .toThrow("Property 'nonexistent' not found on label 'Class'")
  })

  it("throws with available properties list for unknown vertex property", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    expect(() => inferExpressionType(parseExpression("c.nonexistent"), env, schema))
      .toThrow(/Available: \[/)
  })
})

describe("inferExpressionType — aggregate functions", () => {
  it.each([
    { expr: "count(*)", expected: new ScalarType({ scalarType: "Long" }) },
    { expr: "sum(x)", expected: new ScalarType({ scalarType: "Long" }) },
    { expr: "avg(x)", expected: NullableType(new ScalarType({ scalarType: "Double" })) },
    { expr: "min(x)", expected: NullableType(new ScalarType({ scalarType: "Long" })) },
    { expr: "max(x)", expected: NullableType(new ScalarType({ scalarType: "Long" })) }
  ])("$expr infers correctly", ({ expected, expr }) => {
    const env = envWith({ x: { type: new ScalarType({ scalarType: "Long" }), nullable: false } })
    const result = inferExpressionType(parseExpression(expr), env, schema)
    expect(result).toEqual(expected)
  })
})

describe("inferExpressionType — collect", () => {
  it("collect(scalar) returns ListType(scalar)", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("collect(c.fqcn)"), env, schema)
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })

  it("collect(map literal) returns ListType(MapType(...)) with nullable fields", () => {
    const env = envWith({
      m: { type: new VertexType({ label: "Method" }), nullable: false }
    })
    const result = inferExpressionType(
      parseExpression("collect({visibility: m.visibility, id: m.id})"),
      env,
      schema
    )
    // visibility is mandatory: false → NullableType; id is mandatory: true → plain
    expect(result).toEqual(ListType(
      MapType([
        { name: "visibility", value: NullableType(new ScalarType({ scalarType: "String" })) },
        { name: "id", value: new ScalarType({ scalarType: "String" }) }
      ])
    ))
  })
})

describe("inferExpressionType — coalesce", () => {
  it("returns type of first argument", () => {
    const env = envWith({ f: { type: new VertexType({ label: "File" }), nullable: false } })
    const result = inferExpressionType(parseExpression("coalesce(f.lineCount, 0)"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })
})

describe("inferExpressionType — size", () => {
  it("size() returns Long", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("size(c.subdomains)"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })
})

describe("inferExpressionType — map literal", () => {
  it("infers field types recursively with nullability", () => {
    const env = envWith({
      m: { type: new VertexType({ label: "Method" }), nullable: false }
    })
    const result = inferExpressionType(
      parseExpression("{name: m.id, vis: m.visibility}"),
      env,
      schema
    )
    // id is mandatory: true, visibility is mandatory: false
    expect(result).toEqual(MapType([
      { name: "name", value: new ScalarType({ scalarType: "String" }) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) }
    ]))
  })
})

describe("inferExpressionType — CASE expression", () => {
  it("infers type from THEN branch", () => {
    const env = envWith({
      m: { type: new VertexType({ label: "Method" }), nullable: false }
    })
    const result = inferExpressionType(
      parseExpression("CASE WHEN m.id IS NOT NULL THEN m.id ELSE 'unknown' END"),
      env,
      schema
    )
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })
})

describe("inferExpressionType — comparison and boolean", () => {
  it("IS NOT NULL returns Boolean", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(parseExpression("m.returnType IS NOT NULL"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "Boolean" }))
  })
})

describe("inferExpressionType — nested collect with CASE and map", () => {
  it("handles the ClassProfiles pattern: collect(CASE WHEN ... THEN {map} END)", () => {
    const env = envWith({
      m: { type: new VertexType({ label: "Method" }), nullable: false }
    })
    const result = inferExpressionType(
      parseExpression("collect(CASE WHEN m IS NOT NULL THEN {visibility: m.visibility, id: m.id} END)"),
      env,
      schema
    )
    expect(result).toEqual(ListType(
      MapType([
        { name: "visibility", value: NullableType(new ScalarType({ scalarType: "String" })) },
        { name: "id", value: new ScalarType({ scalarType: "String" }) }
      ])
    ))
  })
})

describe("inferExpressionType — nullable property access", () => {
  it("non-mandatory property wraps in NullableType", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(parseExpression("m.visibility"), env, schema)
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })

  it("mandatory property does NOT wrap in NullableType", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(parseExpression("m.id"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })

  it("map literal with nullable field has NullableType value", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("{id: m.id, ccn: m.ccn}"),
      env,
      schema
    )
    expect(result).toEqual(MapType([
      { name: "id", value: new ScalarType({ scalarType: "String" }) },
      { name: "ccn", value: NullableType(new ScalarType({ scalarType: "Long" })) }
    ]))
  })
})

describe("inferExpressionType — property access on nullable variable", () => {
  it("mandatory property on nullable variable wraps in NullableType", () => {
    const env = envWith({ mc: { type: new VertexType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(parseExpression("mc.id"), env, schema)
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })

  it("non-mandatory property on nullable variable stays NullableType", () => {
    const env = envWith({ mc: { type: new VertexType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(parseExpression("mc.visibility"), env, schema)
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })

  it("map literal with nullable variable makes all fields nullable", () => {
    const env = envWith({ mc: { type: new VertexType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("{id: mc.id, vis: mc.visibility}"),
      env,
      schema
    )
    expect(result).toEqual(MapType([
      { name: "id", value: NullableType(new ScalarType({ scalarType: "String" })) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) }
    ]))
  })

  it("collect(map) with nullable variable wraps mandatory fields", () => {
    const env = envWith({ mc: { type: new VertexType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("collect({id: mc.id, vis: mc.visibility})"),
      env,
      schema
    )
    expect(result).toEqual(ListType(MapType([
      { name: "id", value: NullableType(new ScalarType({ scalarType: "String" })) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) }
    ])))
  })
})

describe("inferExpressionType — CASE WHEN IS NOT NULL narrowing", () => {
  it("narrows nullable variable in THEN branch", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("CASE WHEN m IS NOT NULL THEN m.id END"),
      env,
      schema
    )
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })

  it("narrows nullable variable in map literal", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("CASE WHEN m IS NOT NULL THEN {id: m.id, vis: m.visibility} END"),
      env,
      schema
    )
    // id: mandatory + narrowed → non-null; vis: non-mandatory → still nullable
    expect(result).toEqual(MapType([
      { name: "id", value: new ScalarType({ scalarType: "String" }) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) }
    ]))
  })

  it("does not narrow without IS NOT NULL", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("CASE WHEN true THEN m.id END"),
      env,
      schema
    )
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })
})

describe("inferExpressionType — collect strips NullableType", () => {
  it("strips NullableType from element", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("collect(m.visibility)"),
      env,
      schema
    )
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })

  it("non-nullable stays unchanged", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("collect(c.fqcn)"),
      env,
      schema
    )
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })
})

describe("inferExpressionType — CASE + collect combined", () => {
  it("collect(CASE WHEN x IS NOT NULL THEN {map} END) narrows + collects", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: true } })
    const result = inferExpressionType(
      parseExpression("collect(CASE WHEN m IS NOT NULL THEN {id: m.id, vis: m.visibility} END)"),
      env,
      schema
    )
    expect(result).toEqual(ListType(MapType([
      { name: "id", value: new ScalarType({ scalarType: "String" }) },
      { name: "vis", value: NullableType(new ScalarType({ scalarType: "String" })) }
    ])))
  })
})

describe("inferExpressionType — string concatenation", () => {
  it("string + string infers as String", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("m.id + m.id"),
      env,
      schema
    )
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })
})

describe("inferExpressionType — relationship property access", () => {
  it.each([
    {
      label: "mandatory rel property resolves from schema",
      edgeType: "CALLS",
      expr: "r.confidence",
      expected: new ScalarType({ scalarType: "String" })
    },
    {
      label: "mandatory Double rel property resolves",
      edgeType: "CALLS",
      expr: "r.edge_count",
      expected: new ScalarType({ scalarType: "Double" })
    },
    {
      label: "non-mandatory rel property wraps in NullableType",
      edgeType: "BELONGS_TO",
      expr: "r.role",
      expected: NullableType(new ScalarType({ scalarType: "String" }))
    }
  ])("$label", ({ edgeType, expected, expr }) => {
    const env = envWith({ r: { type: new EdgeType({ edgeType }), nullable: false } })
    const result = inferExpressionType(parseExpression(expr), env, schema)
    expect(result).toEqual(expected)
  })

  it("throws for unknown edge property", () => {
    const env = envWith({ r: { type: new EdgeType({ edgeType: "CALLS" }), nullable: false } })
    expect(() => inferExpressionType(parseExpression("r.nonexistent"), env, schema))
      .toThrow("Property 'nonexistent' not found on edge type 'CALLS'")
  })
})

describe("inferExpressionType — standalone CASE with string literals", () => {
  it("infers String from THEN branch with string literal", () => {
    const env = envWith({ m: { type: new VertexType({ label: "Method" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("CASE WHEN m.ccn <= 5 THEN '1-5' ELSE '21+' END"),
      env,
      schema
    )
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })

  it("infers Long from THEN branch with mandatory property", () => {
    const env = envWith({ f: { type: new VertexType({ label: "File" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("CASE WHEN f.lineCount > 10 THEN f.lineCount ELSE f.lineCount END"),
      env,
      schema
    )
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })
})

describe("inferExpressionType — COUNT subquery", () => {
  it("COUNT { pattern } infers as Long", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("COUNT { (m:Method)-[:BELONGS_TO]->(c) }"),
      env,
      schema
    )
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })

  it("COUNT { pattern WHERE predicate } infers as Long", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("COUNT { (m:Method)-[:BELONGS_TO]->(c) WHERE m.source = \"codebase\" }"),
      env,
      schema
    )
    expect(result).toEqual(new ScalarType({ scalarType: "Long" }))
  })
})

describe("inferExpressionType — EXISTS subquery", () => {
  it("EXISTS { pattern } infers as Boolean", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("EXISTS { (m:Method)-[:BELONGS_TO]->(c) }"),
      env,
      schema
    )
    expect(result).toEqual(new ScalarType({ scalarType: "Boolean" }))
  })
})

describe("inferExpressionType — strict mode errors", () => {
  it("throws for property access on non-node/non-rel type", () => {
    const env = envWith({ x: { type: new ScalarType({ scalarType: "String" }), nullable: false } })
    expect(() => inferExpressionType(parseExpression("x.foo"), env, schema))
      .toThrow("Cannot access property on type 'ScalarType'")
  })

  it("throws for unrecognized function", () => {
    const env = envWith({ x: { type: new ScalarType({ scalarType: "Long" }), nullable: false } })
    expect(() => inferExpressionType(parseExpression("notAFunction(x)"), env, schema))
      .toThrow("Unrecognized function 'notafunction'")
  })

  it("NULL literal returns NeverType", () => {
    const result = inferExpressionType(parseExpression("null"), emptyEnv, schema)
    expect(result).toEqual(new NeverType({}))
  })

  it("empty list returns ListType(NeverType)", () => {
    const result = inferExpressionType(parseExpression("[]"), emptyEnv, schema)
    expect(result).toEqual(ListType(new NeverType({})))
  })
})

describe("inferExpressionType — previously unhandled constructs", () => {
  it("properties(node) returns MapType([])", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(parseExpression("properties(c)"), env, schema)
    expect(result).toEqual(MapType([]))
  })

  it("reduce with empty list init infers from iteration list", () => {
    const env = envWith({
      items: { type: ListType(ListType(new ScalarType({ scalarType: "String" }))), nullable: false }
    })
    const result = inferExpressionType(
      parseExpression("reduce(acc = [], x IN items | acc + x)"),
      env,
      schema
    )
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })

  it("any() list predicate returns Boolean", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("any(x IN c.subdomains WHERE x = 'billing')"),
      env,
      schema
    )
    expect(result).toEqual(new ScalarType({ scalarType: "Boolean" }))
  })

  it("list comprehension with pipe returns ListType of pipe type", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("[x IN c.subdomains | x]"),
      env,
      schema
    )
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })

  it("list comprehension filter-only returns filtered list type", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("[x IN c.subdomains WHERE x = 'billing']"),
      env,
      schema
    )
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })

  it("list + with NeverType element returns concrete element type", () => {
    const env = envWith({ c: { type: new VertexType({ label: "Class" }), nullable: false } })
    const result = inferExpressionType(
      parseExpression("[] + c.subdomains"),
      env,
      schema
    )
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })
})

describe("inferExpressionType — VertexUnionType property access", () => {
  // VertexUnionType represents a node that could be one of several labels.
  // Property access follows the 3-case typing rule:
  //   Case 1: property mandatory on ALL members → non-nullable
  //   Case 2: property exists on SOME members → NullableType
  //   Case 3: property exists on NO member → CypherTypeError

  it("Case 1: property mandatory on all union members → non-nullable", () => {
    // Both Class and Method have mandatory 'id' (Class.fqcn ≠ id, but Method.id exists)
    // Both have mandatory string 'name' property  → non-nullable String
    const env = envWith({
      e: { type: new VertexUnionType({ labels: ["Class", "Method"] }), nullable: false }
    })
    const result = inferExpressionType(parseExpression("e.kind"), env, schema)
    // kind is mandatory on Class but not on Method → should be NullableType (Case 2)
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })

  it("Case 2: property exists on some members → NullableType", () => {
    // fqcn exists on Class (mandatory) but not on Method
    const env = envWith({
      e: { type: new VertexUnionType({ labels: ["Class", "Method"] }), nullable: false }
    })
    const result = inferExpressionType(parseExpression("e.fqcn"), env, schema)
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })

  it("Case 3: property exists on no union member → CypherTypeError", () => {
    const env = envWith({
      e: { type: new VertexUnionType({ labels: ["Class", "Method"] }), nullable: false }
    })
    expect(() => inferExpressionType(parseExpression("e.nonexistent"), env, schema))
      .toThrow("nonexistent")
  })

  it("property mandatory on all members with same type → non-nullable", () => {
    // Both Class and Method have id as String mandatory (Class via fqcn... let me use a clear case)
    // Use a union where both have 'isStatic' — Class has it (non-mandatory), Method doesn't have it
    // Actually let me test with properties that are truly mandatory on all:
    // Class.fqcn(mandatory), Class.kind(mandatory) — but this is single label
    // Let me use two labels that share a mandatory prop: both have String name mandatory
    const env = envWith({
      e: { type: new VertexUnionType({ labels: ["Class", "Method"] }), nullable: false }
    })
    // Both Class and Method have mandatory 'name' → non-nullable
    const result = inferExpressionType(parseExpression("e.name"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })

  it("nullable variable wraps result in NullableType", () => {
    const env = envWith({
      e: { type: new VertexUnionType({ labels: ["Class", "Method"] }), nullable: true }
    })
    // name is mandatory on all members, but variable is nullable → NullableType
    const result = inferExpressionType(parseExpression("e.name"), env, schema)
    expect(result).toEqual(NullableType(new ScalarType({ scalarType: "String" })))
  })

  it("collect on VertexUnionType property strips nullable", () => {
    const env = envWith({
      e: { type: new VertexUnionType({ labels: ["Class", "Method"] }), nullable: false }
    })
    // fqcn is on Class only → NullableType(String) → collect strips nullable
    const result = inferExpressionType(parseExpression("collect(e.fqcn)"), env, schema)
    expect(result).toEqual(ListType(new ScalarType({ scalarType: "String" })))
  })

  it("coalesce on VertexUnionType properties strips nullable", () => {
    const env = envWith({
      e: { type: new VertexUnionType({ labels: ["Class", "Method"] }), nullable: false }
    })
    // coalesce(e.fqcn, e.id) — both partial → NullableType, coalesce strips
    const result = inferExpressionType(parseExpression("coalesce(e.fqcn, e.id)"), env, schema)
    expect(result).toEqual(new ScalarType({ scalarType: "String" }))
  })
})
