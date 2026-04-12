/** @since 0.0.1 */
import type { GraphSchema } from "@evryg/effect-neo4j-schema"
import {
  type CypherType,
  ListType,
  MapType,
  NeverType,
  NullableType,
  ScalarType,
  UnknownType
} from "../types/CypherType.js"
import type {
  AtomContext,
  AtomicExpressionContext,
  CaseExpressionContext,
  ExpressionContext,
  FunctionInvocationContext,
  MapPairContext,
  PropertyExpressionContext
} from "./generated-parser/CypherParser.js"

/**
 * @since 0.0.1
 * @category errors
 */
export class CypherTypeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CypherTypeError"
  }
}

// ── Type environment ──

/**
 * @since 0.0.1
 * @category models
 */
export type TypeEnv = ReadonlyMap<string, { readonly type: CypherType; readonly nullable: boolean }>

// ── Schema lookup ──

function normalizeNeo4jType(raw: string): CypherType {
  const upper = raw.toUpperCase().replace(/ NOT NULL/g, "").trim()
  switch (upper) {
    case "STRING":
      return new ScalarType({ scalarType: "String" })
    case "LONG":
    case "INTEGER":
      return new ScalarType({ scalarType: "Long" })
    case "FLOAT":
    case "DOUBLE":
      return new ScalarType({ scalarType: "Double" })
    case "BOOLEAN":
      return new ScalarType({ scalarType: "Boolean" })
    case "DATE":
      return new ScalarType({ scalarType: "Date" })
    case "DATETIME":
    case "ZONED DATETIME":
      return new ScalarType({ scalarType: "DateTime" })
    case "LOCAL DATETIME":
      return new ScalarType({ scalarType: "LocalDateTime" })
    case "LOCAL TIME":
      return new ScalarType({ scalarType: "LocalTime" })
    case "TIME":
    case "ZONED TIME":
      return new ScalarType({ scalarType: "Time" })
    case "DURATION":
      return new ScalarType({ scalarType: "Duration" })
    case "POINT":
      return new ScalarType({ scalarType: "Point" })
    default:
      if (upper.startsWith("LIST<STRING") || upper === "STRINGARRAY") {
        return ListType(new ScalarType({ scalarType: "String" }))
      }
      if (upper.startsWith("LIST<LONG") || upper.startsWith("LIST<INTEGER") || upper === "LONGARRAY") {
        return ListType(new ScalarType({ scalarType: "Long" }))
      }
      if (upper.startsWith("LIST<FLOAT") || upper.startsWith("LIST<DOUBLE") || upper === "DOUBLEARRAY") {
        return ListType(new ScalarType({ scalarType: "Double" }))
      }
      if (upper.startsWith("LIST<BOOLEAN") || upper === "BOOLEANARRAY") {
        return ListType(new ScalarType({ scalarType: "Boolean" }))
      }
      if (upper.startsWith("LIST<")) return ListType(new ScalarType({ scalarType: "String" }))
      return new ScalarType({ scalarType: "String" })
  }
}

function lookupVertexPropertyType(
  schema: GraphSchema,
  label: string,
  propertyName: string
): { type: CypherType; mandatory: boolean } | undefined {
  const prop = schema.vertexProperties.find(
    (p) => p.labels.includes(label) && p.propertyName === propertyName
  )
  if (!prop) return undefined
  const rawType = prop.propertyTypes[0]
  if (!rawType) return undefined
  return { type: normalizeNeo4jType(rawType), mandatory: prop.mandatory }
}

function lookupEdgePropertyType(
  schema: GraphSchema,
  edgeType: string,
  propertyName: string
): { type: CypherType; mandatory: boolean } | undefined {
  const normalized = edgeType.replace(/[:`]/g, "")
  const prop = schema.edgeProperties.find(
    (p) => p.edgeType.replace(/[:`]/g, "") === normalized && p.propertyName === propertyName
  )
  if (!prop) return undefined
  const rawType = prop.propertyTypes[0]
  if (!rawType) return undefined
  return { type: normalizeNeo4jType(rawType), mandatory: prop.mandatory }
}

// ── List element extraction ──

/** Extract the element type from a list, unwrapping NullableType if present.
 *  NullableType wraps non-mandatory properties — nullability is on the list, not the elements. */
function extractListElementType(listType: CypherType): CypherType {
  const unwrapped = listType._tag === "NullableType" ? listType.inner : listType
  return unwrapped._tag === "ListType" ? unwrapped.element : unwrapped
}

function isListType(t: CypherType): boolean {
  const unwrapped = t._tag === "NullableType" ? t.inner : t
  return unwrapped._tag === "ListType"
}

// ── Known function return types ──

const AGGREGATE_RETURN_TYPES: Record<string, CypherType> = {
  count: new ScalarType({ scalarType: "Long" }),
  sum: new ScalarType({ scalarType: "Long" }),
  avg: NullableType(new ScalarType({ scalarType: "Double" })),
  min: NullableType(new ScalarType({ scalarType: "Long" })),
  max: NullableType(new ScalarType({ scalarType: "Long" })),
  size: new ScalarType({ scalarType: "Long" }),
  length: new ScalarType({ scalarType: "Long" }),
  tointeger: new ScalarType({ scalarType: "Long" }),
  toint: new ScalarType({ scalarType: "Long" }),
  tofloat: new ScalarType({ scalarType: "Double" }),
  tostring: new ScalarType({ scalarType: "String" }),
  tolower: new ScalarType({ scalarType: "String" }),
  toupper: new ScalarType({ scalarType: "String" }),
  trim: new ScalarType({ scalarType: "String" }),
  ltrim: new ScalarType({ scalarType: "String" }),
  rtrim: new ScalarType({ scalarType: "String" }),
  replace: new ScalarType({ scalarType: "String" }),
  substring: new ScalarType({ scalarType: "String" }),
  left: new ScalarType({ scalarType: "String" }),
  right: new ScalarType({ scalarType: "String" }),
  reverse: new ScalarType({ scalarType: "String" }),
  split: ListType(new ScalarType({ scalarType: "String" }))
}

// ── Recursive expression type inference ──

/**
 * @since 0.0.1
 * @category inference
 */
export function inferExpressionType(
  expr: ExpressionContext,
  env: TypeEnv,
  schema: GraphSchema
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
  const comp = not.comparisonExpression()
  const addSubs = comp.addSubExpression()
  if (addSubs.length > 1) return new ScalarType({ scalarType: "Boolean" })

  // addSubExpression: multDivExpression ((PLUS | SUB) multDivExpression)*
  const addSub = addSubs[0]
  const multDivs = addSub.multDivExpression()

  // String concatenation or list concatenation: multiple addSub operands
  if (multDivs.length > 1) {
    const inferSingle = (md: typeof multDivs[0]): CypherType => {
      const p = md.powerExpression()[0]
      const u = p.unaryAddSubExpression()[0]
      return inferAtomicType(u.atomicExpression(), env, schema)
    }
    const types = multDivs.map(inferSingle)

    // List concatenation: List<A> + List<B> = List<A V B>
    // NeverType is the identity for join (bottom element)
    if (types.every(isListType)) {
      const elements = types.map(extractListElementType)
      const nonNever = elements.filter((e) => e._tag !== "NeverType")
      const joined = nonNever.length > 0 ? nonNever[0] : elements[0]
      return ListType(joined)
    }

    if (types.some((t) => t._tag === "ScalarType" && t.scalarType === "String")) {
      return new ScalarType({ scalarType: "String" })
    }
    // Numeric: return first operand type
    return types[0]
  }

  // multDivExpression: powerExpression ((MULT | DIV | MOD) powerExpression)*
  const multDiv = multDivs[0]
  const powers = multDiv.powerExpression()

  // powerExpression: unaryAddSubExpression (CARET unaryAddSubExpression)*
  const power = powers[0]
  const unary = power.unaryAddSubExpression()[0]

  // unaryAddSubExpression: (PLUS | SUB)? atomicExpression
  const atomic = unary.atomicExpression()

  return inferAtomicType(atomic, env, schema)
}

function inferAtomicType(
  atomic: AtomicExpressionContext,
  env: TypeEnv,
  schema: GraphSchema
): CypherType {
  // atomicExpression: propertyOrLabelExpression (stringExpression | listExpression | nullExpression)*
  const propOrLabel = atomic.propertyOrLabelExpression()

  // Check for IS [NOT] NULL postfix
  const nullExprs = atomic.nullExpression()
  if (nullExprs && nullExprs.length > 0) return new ScalarType({ scalarType: "Boolean" })

  // Check for string predicates (STARTS WITH, ENDS WITH, CONTAINS)
  const strExprs = atomic.stringExpression()
  if (strExprs && strExprs.length > 0) return new ScalarType({ scalarType: "Boolean" })

  // Check for list expressions (IN predicate or array indexing)
  const listExprs = atomic.listExpression()
  if (listExprs && listExprs.length > 0) {
    const listExpr = listExprs[0]
    // IN predicate → boolean
    if (listExpr.IN()) return new ScalarType({ scalarType: "Boolean" })
    // Array indexing [expr] → element type of the base expression, unwrapping NullableType
    const baseType = inferPropertyExpressionType(propOrLabel.propertyExpression(), env, schema)
    const unwrapped = baseType._tag === "NullableType" ? baseType.inner : baseType
    if (unwrapped._tag === "ListType") return unwrapped.element
    throw new CypherTypeError(`Cannot index into non-list type '${baseType._tag}'`)
  }

  // propertyOrLabelExpression: propertyExpression nodeLabels?
  const propExpr = propOrLabel.propertyExpression()

  return inferPropertyExpressionType(propExpr, env, schema)
}

function inferPropertyExpressionType(
  propExpr: PropertyExpressionContext,
  env: TypeEnv,
  schema: GraphSchema
): CypherType {
  // propertyExpression: atom (DOT name)*
  const atom = propExpr.atom()
  const dotNames = propExpr.name()

  const atomType = inferAtomType(atom, env, schema)

  // No property access — just the atom
  if (!dotNames || dotNames.length === 0) return atomType

  // Check if the base variable is nullable (e.g. from OPTIONAL MATCH)
  const symbol = atom.symbol()
  const varNullable = symbol ? env.get(symbol.getText())?.nullable === true : false

  // Property chain: resolve through dot access
  let current = atomType
  for (const nameCtx of dotNames) {
    const propName = nameCtx.getText()
    if (current._tag === "VertexType") {
      const vertexType = current
      const lookup = lookupVertexPropertyType(schema, vertexType.label, propName)
      if (lookup) {
        current = lookup.mandatory ? lookup.type : NullableType(lookup.type)
      } else {
        const available = schema.vertexProperties
          .filter((p) => p.labels.includes(vertexType.label))
          .map((p) => p.propertyName)
        throw new CypherTypeError(
          `Property '${propName}' not found on label '${vertexType.label}'. Available: [${available.join(", ")}]`
        )
      }
    } else if (current._tag === "EdgeType") {
      // Handle union edge types (e.g., "EXTENDS|IMPLEMENTS|USES")
      const edgeTypes = current.edgeType.replace(/[:`]/g, "").split("|")
      let lookup: { type: CypherType; mandatory: boolean } | undefined
      for (const et of edgeTypes) {
        lookup = lookupEdgePropertyType(schema, et, propName)
        if (lookup) break
      }
      if (lookup) {
        current = lookup.mandatory ? lookup.type : NullableType(lookup.type)
      } else {
        const normalized = edgeTypes.join("|")
        const available = schema.edgeProperties
          .filter((p) => edgeTypes.some((et) => p.edgeType.replace(/[:`]/g, "") === et))
          .map((p) => p.propertyName)
        throw new CypherTypeError(
          `Property '${propName}' not found on edge type '${normalized}'. Available: [${
            [...new Set(available)].join(", ")
          }]`
        )
      }
    } else if (current._tag === "VertexUnionType") {
      // ── VertexUnionType property access: 3-case typing rule ──
      //
      //   env(x) = VertexUnionType([L1, L2, ..., Ln])
      //
      //   Case 1: ∀i. schema(Li, p) = (T, mandatory=true)
      //     ⟹ x.p : T                        (mandatory on all → non-nullable)
      //
      //   Case 2: ∃i. schema(Li, p) = (T, _) ∧ ¬(∀i mandatory)
      //     ⟹ x.p : NullableType(T)          (missing on some → Cypher returns null)
      //
      //   Case 3: ¬∃i. schema(Li, p) defined
      //     ⟹ CypherTypeError                 (property on NO member → likely bug)
      //
      const lookups = current.labels.map((label) => ({
        label,
        result: lookupVertexPropertyType(schema, label, propName)
      }))
      const found = lookups.filter((l) => l.result !== undefined)
      if (found.length === 0) {
        const allLabels = current.labels.join(", ")
        throw new CypherTypeError(
          `Property '${propName}' not found on any member of VertexUnionType([${allLabels}])`
        )
      }
      const allMandatory = found.length === current.labels.length
        && found.every((l) => l.result!.mandatory)
      const resolvedType = found[0].result!.type
      current = allMandatory ? resolvedType : NullableType(resolvedType)
    } else if (current._tag === "UnknownType") {
      // Property access on UnknownType (e.g., unlabeled node) — sound: result is UnknownType
      // We can't verify the property exists statically, but can't reject it either
      current = new UnknownType({})
    } else {
      throw new CypherTypeError(`Cannot access property on type '${current._tag}'`)
    }
  }

  // If the base variable is nullable, ensure the result is wrapped in NullableType
  if (varNullable && current._tag !== "NullableType") {
    current = NullableType(current)
  }

  return current
}

function inferAtomType(
  atom: AtomContext,
  env: TypeEnv,
  schema: GraphSchema
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
    if (literal.NULL_W()) return new NeverType({})
    if (literal.mapLit()) return inferMapLitType(literal.mapLit()!, env, schema)
    if (literal.listLit()) {
      const chain = literal.listLit()!.expressionChain()
      if (!chain) return ListType(new NeverType({}))
      const exprs = chain.expression()
      if (exprs.length === 0) return ListType(new NeverType({}))
      const firstType = inferExpressionType(exprs[0], env, schema)
      return ListType(firstType)
    }
    throw new CypherTypeError("Unrecognized literal")
  }

  // count(*)
  if (atom.countAll()) return new ScalarType({ scalarType: "Long" })

  // COUNT { pattern } subquery → Long
  if (atom.countSubquery()) return new ScalarType({ scalarType: "Long" })

  // EXISTS { pattern } subquery → Boolean
  if (atom.subqueryExist()) return new ScalarType({ scalarType: "Boolean" })

  // CASE expression
  const caseExpr = atom.caseExpression()
  if (caseExpr) return inferCaseType(caseExpr, env, schema)

  // Function invocation
  const funcInvoc = atom.functionInvocation()
  if (funcInvoc) return inferFunctionType(funcInvoc, env, schema)

  // Reduce expression: reduce(acc = init, x IN list | body)
  const reduceExpr = atom.reduceExpression()
  if (reduceExpr) {
    const accName = reduceExpr.symbol().getText()
    const initExpr = reduceExpr.expression()
    const initType = inferExpressionType(initExpr[0], env, schema)

    const filterExpr = reduceExpr.filterExpression()
    const iterVarName = filterExpr.symbol().getText()
    const listExpr = filterExpr.expression()
    const listType = inferExpressionType(listExpr, env, schema)
    const elemType = extractListElementType(listType)

    const bodyEnv: TypeEnv = new Map([
      ...env,
      [accName, { type: initType, nullable: false }],
      [iterVarName, { type: elemType, nullable: false }]
    ])
    const bodyExpr = initExpr[1]
    return inferExpressionType(bodyExpr, bodyEnv, schema)
  }

  // filterWith: ANY/ALL/NONE/SINGLE → Boolean
  const filterWith = atom.filterWith()
  if (filterWith) return new ScalarType({ scalarType: "Boolean" })

  // List comprehension: [x IN list | body] or [x IN list WHERE pred]
  const listComp = atom.listComprehension()
  if (listComp) {
    const filterExpr = listComp.filterExpression()
    const iterVarName = filterExpr.symbol().getText()
    const listExpr = filterExpr.expression()
    const listType = inferExpressionType(listExpr, env, schema)
    const elemType = extractListElementType(listType)

    // Check for pipe expression (STICK expression)
    const exprs = listComp.expression()
    if (exprs) {
      // Has pipe: [x IN list | body]
      const bodyEnv: TypeEnv = new Map([
        ...env,
        [iterVarName, { type: elemType, nullable: false }]
      ])
      const pipeType = inferExpressionType(exprs, bodyEnv, schema)
      return ListType(pipeType)
    }
    // Filter only: [x IN list WHERE pred]
    return ListType(elemType)
  }

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
    throw new CypherTypeError(`Unbound variable '${name}'`)
  }

  throw new CypherTypeError("Unhandled atom expression")
}

function inferMapLitType(
  mapLit: NonNullable<ReturnType<AtomContext["literal"]>> extends { mapLit(): infer M } ? NonNullable<M> : never,
  env: TypeEnv,
  schema: GraphSchema
): CypherType {
  const pairs = mapLit.mapPair?.() ?? []
  if (!Array.isArray(pairs)) return MapType([])

  const fields = pairs.map((pair: MapPairContext) => {
    const name = pair.name?.()?.getText?.() ?? ""
    const expr = pair.expression?.()
    if (!expr) throw new CypherTypeError("Map field missing expression")
    const value = inferExpressionType(expr, env, schema)
    return { name, value }
  })

  return MapType(fields)
}

function inferCaseType(
  caseExpr: CaseExpressionContext,
  env: TypeEnv,
  schema: GraphSchema
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
    const whenIndex = hasInitialExpr ? 1 : 0
    const thenIndex = hasInitialExpr ? 2 : 1

    // Narrow nullable variables if WHEN clause is `var IS NOT NULL`
    let thenEnv = env
    if (exprs.length > whenIndex) {
      const narrowedVar = extractIsNotNullVar(exprs[whenIndex])
      if (narrowedVar && env.has(narrowedVar) && env.get(narrowedVar)!.nullable) {
        thenEnv = new Map([...env, [narrowedVar, { ...env.get(narrowedVar)!, nullable: false }]])
      }
    }

    if (exprs.length > thenIndex) {
      return inferExpressionType(exprs[thenIndex], thenEnv, schema)
    }
  }

  throw new CypherTypeError("CASE expression missing THEN branch")
}

/** Extract variable name from `var IS NOT NULL` expression, or undefined */
function extractIsNotNullVar(expr: ExpressionContext): string | undefined {
  // Walk: expression → xorExpression → andExpression → notExpression → comparisonExpression
  //     → addSubExpression → multDivExpression → powerExpression → unaryAddSubExpression
  //     → atomicExpression (which has nullExpression with NOT)
  const xors = expr.xorExpression()
  if (xors.length !== 1) return undefined
  const ands = xors[0].andExpression()
  if (ands.length !== 1) return undefined
  const nots = ands[0].notExpression()
  if (nots.length !== 1) return undefined
  const comp = nots[0].comparisonExpression()
  if (!comp) return undefined
  const addSubs = comp.addSubExpression()
  if (addSubs.length !== 1) return undefined
  const multDivs = addSubs[0].multDivExpression()
  if (multDivs.length !== 1) return undefined
  const powers = multDivs[0].powerExpression()
  if (powers.length !== 1) return undefined
  const unary = powers[0].unaryAddSubExpression()[0]
  const atomic = unary?.atomicExpression()
  if (!atomic) return undefined

  const nullExprs = atomic.nullExpression()
  if (!nullExprs || nullExprs.length === 0) return undefined
  // IS NOT NULL has a NOT token
  if (!nullExprs[0].NOT()) return undefined

  const propOrLabel = atomic.propertyOrLabelExpression()
  if (!propOrLabel) return undefined
  const propExpr = propOrLabel.propertyExpression()
  if (!propExpr) return undefined
  const symbol = propExpr.atom()?.symbol()
  // Only narrow bare variables (no dot access in the IS NOT NULL check)
  if (!symbol || (propExpr.name() && propExpr.name().length > 0)) return undefined
  return symbol.getText()
}

function inferFunctionType(
  func: FunctionInvocationContext,
  env: TypeEnv,
  schema: GraphSchema
): CypherType {
  const funcName = func.invocationName().getText().toLowerCase()
  const argsChain = func.expressionChain()
  const args = argsChain?.expression() ?? []

  // collect(x) → ListType(inferType(x)), stripping NullableType (collect skips nulls)
  if (funcName === "collect") {
    if (args.length > 0) {
      const argType = inferExpressionType(args[0], env, schema)
      const elementType = argType._tag === "NullableType" ? argType.inner : argType
      return ListType(elementType)
    }
    throw new CypherTypeError("collect() requires an argument")
  }

  // coalesce(x, ...) → type of first arg, stripped of nullable (coalesce provides fallback)
  if (funcName === "coalesce") {
    if (args.length > 0) {
      const argType = inferExpressionType(args[0], env, schema)
      return argType._tag === "NullableType" ? argType.inner : argType
    }
    throw new CypherTypeError("coalesce() requires arguments")
  }

  // properties(x) → Map with unknown fields
  if (funcName === "properties") return MapType([])

  // type(r) → String
  if (funcName === "type") return new ScalarType({ scalarType: "String" })

  // keys(x), labels(x) → List<String>
  if (funcName === "keys" || funcName === "labels") {
    return ListType(new ScalarType({ scalarType: "String" }))
  }

  // Known aggregates / conversion functions
  const known = AGGREGATE_RETURN_TYPES[funcName]
  if (known) return known

  throw new CypherTypeError(`Unrecognized function '${funcName}'`)
}
