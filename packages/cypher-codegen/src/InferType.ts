import type {
  ExpressionContext,
  AtomContext,
  PropertyExpressionContext,
  FunctionInvocationContext,
  CaseExpressionContext,
  AtomicExpressionContext,
} from "./generated-parser/CypherParser.js"
import type { GraphSchema } from "./GraphSchemaModel"
import { ScalarType, ListType, MapType, NodeType, UnknownType, type CypherType } from "./CypherType"

// ── Type environment ──

export type TypeEnv = ReadonlyMap<string, { readonly type: CypherType; readonly nullable: boolean }>

// ── Schema lookup ──

function normalizeNeo4jType(raw: string): CypherType {
  const upper = raw.toUpperCase().replace(/ NOT NULL/g, "").trim()
  switch (upper) {
    case "STRING": return new ScalarType({ scalarType: "String" })
    case "LONG": case "INTEGER": return new ScalarType({ scalarType: "Long" })
    case "FLOAT": case "DOUBLE": return new ScalarType({ scalarType: "Double" })
    case "BOOLEAN": return new ScalarType({ scalarType: "Boolean" })
    case "DATE": return new ScalarType({ scalarType: "Date" })
    case "DATETIME": case "ZONED DATETIME": return new ScalarType({ scalarType: "DateTime" })
    case "LOCAL DATETIME": return new ScalarType({ scalarType: "LocalDateTime" })
    case "LOCAL TIME": return new ScalarType({ scalarType: "LocalTime" })
    case "TIME": case "ZONED TIME": return new ScalarType({ scalarType: "Time" })
    case "DURATION": return new ScalarType({ scalarType: "Duration" })
    case "POINT": return new ScalarType({ scalarType: "Point" })
    default:
      if (upper.startsWith("LIST<STRING") || upper === "STRINGARRAY") return ListType(new ScalarType({ scalarType: "String" }))
      if (upper.startsWith("LIST<LONG") || upper.startsWith("LIST<INTEGER") || upper === "LONGARRAY") return ListType(new ScalarType({ scalarType: "Long" }))
      if (upper.startsWith("LIST<FLOAT") || upper.startsWith("LIST<DOUBLE") || upper === "DOUBLEARRAY") return ListType(new ScalarType({ scalarType: "Double" }))
      if (upper.startsWith("LIST<BOOLEAN") || upper === "BOOLEANARRAY") return ListType(new ScalarType({ scalarType: "Boolean" }))
      if (upper.startsWith("LIST<")) return ListType(new ScalarType({ scalarType: "String" }))
      return new ScalarType({ scalarType: "String" })
  }
}

function lookupPropertyType(schema: GraphSchema, label: string, propertyName: string): CypherType | undefined {
  const prop = schema.nodeProperties.find(
    (p) => p.labels.includes(label) && p.propertyName === propertyName,
  )
  if (!prop) return undefined
  const rawType = prop.propertyTypes[0]
  if (!rawType) return undefined
  return normalizeNeo4jType(rawType)
}

// ── Known function return types ──

const AGGREGATE_RETURN_TYPES: Record<string, CypherType> = {
  count: new ScalarType({ scalarType: "Long" }),
  sum: new ScalarType({ scalarType: "Long" }),
  avg: new ScalarType({ scalarType: "Double" }),
  min: new ScalarType({ scalarType: "Long" }),
  max: new ScalarType({ scalarType: "Long" }),
  size: new ScalarType({ scalarType: "Long" }),
  length: new ScalarType({ scalarType: "Long" }),
  tointeger: new ScalarType({ scalarType: "Long" }),
  toint: new ScalarType({ scalarType: "Long" }),
  tofloat: new ScalarType({ scalarType: "Double" }),
  tostring: new ScalarType({ scalarType: "String" }),
}

// ── Recursive expression type inference ──

export function inferExpressionType(
  expr: ExpressionContext,
  env: TypeEnv,
  schema: GraphSchema,
): CypherType {
  // expression: xorExpression (OR xorExpression)*
  const xorExprs = expr.xorExpression()
  if (xorExprs.length > 1) return new ScalarType({ scalarType: "Boolean" })

  // xorExpression: andExpression (XOR andExpression)*
  const xor = xorExprs[0]
  const andExprs = xor.andExpression()
  if (andExprs.length > 1) return new ScalarType({ scalarType: "Boolean" })

  // andExpression: notExpression (AND notExpression)*
  const and = andExprs[0]
  const notExprs = and.notExpression()
  if (notExprs.length > 1) return new ScalarType({ scalarType: "Boolean" })

  // notExpression: NOT? comparisonExpression
  const not = notExprs[0]
  if (not.NOT()) return new ScalarType({ scalarType: "Boolean" })

  // comparisonExpression: addSubExpression (comparisonSigns addSubExpression)*
  const comp = not.comparisonExpression()!
  const addSubs = comp.addSubExpression()
  if (addSubs.length > 1) return new ScalarType({ scalarType: "Boolean" })

  // addSubExpression: multDivExpression ((PLUS | SUB) multDivExpression)*
  const addSub = addSubs[0]
  const multDivs = addSub.multDivExpression()
  // Arithmetic: for now, return the type of the first operand
  // (could do numeric promotion, but simple approach works for most cases)

  // multDivExpression: powerExpression ((MULT | DIV | MOD) powerExpression)*
  const multDiv = multDivs[0]
  const powers = multDiv.powerExpression()

  // powerExpression: unaryAddSubExpression (CARET unaryAddSubExpression)*
  const power = powers[0]
  const unary = power.unaryAddSubExpression()[0]

  // unaryAddSubExpression: (PLUS | SUB)? atomicExpression
  const atomic = unary.atomicExpression()!

  return inferAtomicType(atomic, env, schema)
}

function inferAtomicType(
  atomic: AtomicExpressionContext,
  env: TypeEnv,
  schema: GraphSchema,
): CypherType {
  // atomicExpression: propertyOrLabelExpression (stringExpression | listExpression | nullExpression)*
  const propOrLabel = atomic.propertyOrLabelExpression()!

  // Check for IS [NOT] NULL postfix
  const nullExprs = atomic.nullExpression()
  if (nullExprs && nullExprs.length > 0) return new ScalarType({ scalarType: "Boolean" })

  // Check for string predicates (STARTS WITH, ENDS WITH, CONTAINS)
  const strExprs = atomic.stringExpression()
  if (strExprs && strExprs.length > 0) return new ScalarType({ scalarType: "Boolean" })

  // Check for IN predicate
  const listExprs = atomic.listExpression()
  if (listExprs && listExprs.length > 0) return new ScalarType({ scalarType: "Boolean" })

  // propertyOrLabelExpression: propertyExpression nodeLabels?
  const propExpr = propOrLabel.propertyExpression()!

  return inferPropertyExpressionType(propExpr, env, schema)
}

function inferPropertyExpressionType(
  propExpr: PropertyExpressionContext,
  env: TypeEnv,
  schema: GraphSchema,
): CypherType {
  // propertyExpression: atom (DOT name)*
  const atom = propExpr.atom()!
  const dotNames = propExpr.name()

  const atomType = inferAtomType(atom, env, schema)

  // No property access — just the atom
  if (!dotNames || dotNames.length === 0) return atomType

  // Property chain: resolve through dot access
  let current = atomType
  for (const nameCtx of dotNames) {
    const propName = nameCtx.getText()
    if (current._tag === "NodeType") {
      const resolved = lookupPropertyType(schema, current.label, propName)
      current = resolved ?? new UnknownType({})
    } else {
      current = new UnknownType({})
    }
  }
  return current
}

function inferAtomType(
  atom: AtomContext,
  env: TypeEnv,
  schema: GraphSchema,
): CypherType {
  // atom: literal | parameter | caseExpression | countAll | listComprehension
  //     | patternComprehension | filterWith | relationshipsChainPattern
  //     | parenthesizedExpression | functionInvocation | symbol | subqueryExist

  // Literal
  const literal = atom.literal()
  if (literal) {
    if (literal.numLit()) return new ScalarType({ scalarType: "Long" })
    if (literal.stringLit() || literal.charLit()) return new ScalarType({ scalarType: "String" })
    if (literal.boolLit()) return new ScalarType({ scalarType: "Boolean" })
    if (literal.NULL_W()) return new UnknownType({})
    if (literal.mapLit()) return inferMapLitType(literal.mapLit()!, env, schema)
    if (literal.listLit()) {
      const chain = literal.listLit()!.expressionChain()
      if (!chain) return ListType(new UnknownType({}))
      const exprs = chain.expression()
      if (exprs.length === 0) return ListType(new UnknownType({}))
      const firstType = inferExpressionType(exprs[0], env, schema)
      return ListType(firstType)
    }
    return new UnknownType({})
  }

  // count(*)
  if (atom.countAll()) return new ScalarType({ scalarType: "Long" })

  // CASE expression
  const caseExpr = atom.caseExpression()
  if (caseExpr) return inferCaseType(caseExpr, env, schema)

  // Function invocation
  const funcInvoc = atom.functionInvocation()
  if (funcInvoc) return inferFunctionType(funcInvoc, env, schema)

  // Parenthesized expression
  const parenExpr = atom.parenthesizedExpression()
  if (parenExpr) {
    const inner = parenExpr.expression()
    if (inner) return inferExpressionType(inner, env, schema)
  }

  // Symbol (bare variable)
  const symbol = atom.symbol()
  if (symbol) {
    const name = symbol.getText()
    const entry = env.get(name)
    if (entry) return entry.type
    return new UnknownType({})
  }

  return new UnknownType({})
}

function inferMapLitType(
  mapLit: NonNullable<ReturnType<AtomContext["literal"]>> extends { mapLit(): infer M } ? NonNullable<M> : never,
  env: TypeEnv,
  schema: GraphSchema,
): CypherType {
  const pairs = (mapLit as any).mapPair?.() ?? []
  if (!Array.isArray(pairs)) return MapType([])

  const fields = pairs.map((pair: any) => {
    const name = pair.name?.()?.getText?.() ?? ""
    const expr = pair.expression?.()
    const value = expr ? inferExpressionType(expr, env, schema) : new UnknownType({})
    return { name, value }
  })

  return MapType(fields)
}

function inferCaseType(
  caseExpr: CaseExpressionContext,
  env: TypeEnv,
  schema: GraphSchema,
): CypherType {
  // CASE expression? (WHEN expression THEN expression)+ (ELSE expression)? END
  // Infer type from the first THEN branch
  const exprs = caseExpr.expression()
  // In a simple CASE: CASE expr WHEN val THEN result ...
  // In a generic CASE: CASE WHEN cond THEN result ...
  // THEN expressions are at odd indices (1, 3, 5, ...) for generic CASE
  // or at even indices for simple CASE with initial expression

  // The THEN keyword positions tell us which expressions are results
  const thenTokens = caseExpr.THEN()
  if (thenTokens && thenTokens.length > 0) {
    // Find the first THEN result expression
    // In the grammar: CASE expr? (WHEN expr THEN expr)+ (ELSE expr)? END
    // With initial CASE expr: exprs[0]=case, exprs[1]=when, exprs[2]=then, ...
    // Without: exprs[0]=when, exprs[1]=then, ...
    const hasInitialExpr = caseExpr.expression().length > thenTokens.length * 2 + (caseExpr.ELSE() ? 1 : 0)
    const thenIndex = hasInitialExpr ? 2 : 1
    if (exprs.length > thenIndex) {
      return inferExpressionType(exprs[thenIndex], env, schema)
    }
  }

  return new UnknownType({})
}

function inferFunctionType(
  func: FunctionInvocationContext,
  env: TypeEnv,
  schema: GraphSchema,
): CypherType {
  const funcName = func.invocationName()!.getText().toLowerCase()
  const argsChain = func.expressionChain()
  const args = argsChain?.expression() ?? []

  // collect(x) → ListType(inferType(x))
  if (funcName === "collect") {
    if (args.length > 0) {
      const argType = inferExpressionType(args[0], env, schema)
      return ListType(argType)
    }
    return ListType(new UnknownType({}))
  }

  // coalesce(x, ...) → type of first arg
  if (funcName === "coalesce") {
    if (args.length > 0) {
      return inferExpressionType(args[0], env, schema)
    }
    return new UnknownType({})
  }

  // type(r) → String
  if (funcName === "type") return new ScalarType({ scalarType: "String" })

  // keys(x), labels(x) → List<String>
  if (funcName === "keys" || funcName === "labels") {
    return ListType(new ScalarType({ scalarType: "String" }))
  }

  // Known aggregates / conversion functions
  const known = AGGREGATE_RETURN_TYPES[funcName]
  if (known) return known

  return new UnknownType({})
}
