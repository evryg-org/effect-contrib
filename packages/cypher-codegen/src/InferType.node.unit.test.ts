import { describe, it, expect } from "@effect/vitest"
import { inferExpressionType, type TypeEnv } from "./InferType"
import { ScalarType, ListType, MapType, NodeType, UnknownType } from "./CypherType"
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

function envWith(entries: Record<string, { type: InstanceType<typeof ScalarType | typeof ListType | typeof MapType | typeof NodeType | typeof UnknownType>; nullable: boolean }>): TypeEnv {
  return new Map(Object.entries(entries))
}

// ── Tests ──

describe("inferExpressionType — literals", () => {
  it.each([
    { expr: "42", expected: new ScalarType({ scalarType: "Long" }) },
    { expr: "'hello'", expected: new ScalarType({ scalarType: "String" }) },
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
    expect(result).toEqual(new ListType({ element: new ScalarType({ scalarType: "String" }) }))
  })

  it("collect(map literal) returns ListType(MapType(...))", () => {
    const env = envWith({
      m: { type: new NodeType({ label: "Method" }), nullable: false },
    })
    const result = inferExpressionType(
      parseExpression("collect({visibility: m.visibility, id: m.id})"),
      env,
      schema,
    )
    expect(result).toEqual(new ListType({
      element: new MapType({
        fields: [
          { name: "visibility", value: new ScalarType({ scalarType: "String" }) },
          { name: "id", value: new ScalarType({ scalarType: "String" }) },
        ],
      }),
    }))
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
  it("infers field types recursively", () => {
    const env = envWith({
      m: { type: new NodeType({ label: "Method" }), nullable: false },
    })
    const result = inferExpressionType(
      parseExpression("{name: m.id, vis: m.visibility}"),
      env,
      schema,
    )
    expect(result).toEqual(new MapType({
      fields: [
        { name: "name", value: new ScalarType({ scalarType: "String" }) },
        { name: "vis", value: new ScalarType({ scalarType: "String" }) },
      ],
    }))
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
    expect(result).toEqual(new ListType({
      element: new MapType({
        fields: [
          { name: "visibility", value: new ScalarType({ scalarType: "String" }) },
          { name: "id", value: new ScalarType({ scalarType: "String" }) },
        ],
      }),
    }))
  })
})
