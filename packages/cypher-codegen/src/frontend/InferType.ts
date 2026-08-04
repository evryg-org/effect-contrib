/** @since 0.0.1 */
import type { GraphSchema } from "@evryg/effect-neo4j-schema"
import type {
  AddSubExpressionContext,
  AtomContext,
  AtomicExpressionContext,
  CaseExpressionContext,
  ExpressionContext,
  FunctionInvocationContext,
  MapPairContext,
  MultDivExpressionContext,
  PowerExpressionContext,
  PropertyExpressionContext,
  UnaryAddSubExpressionContext
} from "../internal/generated-parser/CypherParser.js"
import {
  type CypherType,
  ListType,
  MapType,
  NeverType,
  NullableType,
  ScalarType,
  UnknownType
} from "../types/CypherType.js"

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

// ── Type helpers ──

/** Peel a top-level NullableType off a type, leaving its payload. */
function stripNullable(t: CypherType): CypherType {
  return t._tag === "NullableType" ? t.inner : t
}

// ── List element extraction ──

/** Extract the element type from a list, unwrapping NullableType if present.
 *  NullableType wraps non-mandatory properties — nullability is on the list, not the elements. */
function extractListElementType(listType: CypherType): CypherType {
  const unwrapped = stripNullable(listType)
  return unwrapped._tag === "ListType" ? unwrapped.element : unwrapped
}

function isListType(t: CypherType): boolean {
  return stripNullable(t)._tag === "ListType"
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
  split: ListType(new ScalarType({ scalarType: "String" })),
  // Scalar math functions. In Neo4j these return Float regardless of argument type,
  // except sign (Integer) and abs (input-preserving — handled in inferFunctionType).
  e: new ScalarType({ scalarType: "Double" }),
  pi: new ScalarType({ scalarType: "Double" }),
  rand: new ScalarType({ scalarType: "Double" }),
  exp: new ScalarType({ scalarType: "Double" }),
  log: new ScalarType({ scalarType: "Double" }),
  log10: new ScalarType({ scalarType: "Double" }),
  sqrt: new ScalarType({ scalarType: "Double" }),
  ceil: new ScalarType({ scalarType: "Double" }),
  floor: new ScalarType({ scalarType: "Double" }),
  round: new ScalarType({ scalarType: "Double" }),
  sin: new ScalarType({ scalarType: "Double" }),
  cos: new ScalarType({ scalarType: "Double" }),
  tan: new ScalarType({ scalarType: "Double" }),
  cot: new ScalarType({ scalarType: "Double" }),
  asin: new ScalarType({ scalarType: "Double" }),
  acos: new ScalarType({ scalarType: "Double" }),
  atan: new ScalarType({ scalarType: "Double" }),
  atan2: new ScalarType({ scalarType: "Double" }),
  degrees: new ScalarType({ scalarType: "Double" }),
  radians: new ScalarType({ scalarType: "Double" }),
  haversine: new ScalarType({ scalarType: "Double" }),
  sign: new ScalarType({ scalarType: "Long" })
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
  return inferAddSubType(addSubs[0], env, schema)
}

// ── Arithmetic operand typing ──

const isNumericScalar = (t: CypherType): boolean =>
  t._tag === "ScalarType" && (t.scalarType === "Long" || t.scalarType === "Double")

/** Numeric join over arithmetic operands: `Long ⊔ Double = Double`. Returns `undefined` when any
 *  operand is not a numeric scalar (e.g. dates/durations), so callers fall back to their leading
 *  operand and don't regress non-numeric arithmetic. */
function numericJoin(types: ReadonlyArray<CypherType>): CypherType | undefined {
  if (types.length === 0 || !types.every(isNumericScalar)) return undefined
  const anyDouble = types.some((t) => t._tag === "ScalarType" && t.scalarType === "Double")
  return new ScalarType({ scalarType: anyDouble ? "Double" : "Long" })
}

/** addSubExpression: multDivExpression ((PLUS | SUB) multDivExpression)* */
function inferAddSubType(
  addSub: AddSubExpressionContext,
  env: TypeEnv,
  schema: GraphSchema
): CypherType {
  const multDivs = addSub.multDivExpression()
  if (multDivs.length === 1) return inferMultDivType(multDivs[0], env, schema)

  const types = multDivs.map((md) => inferMultDivType(md, env, schema))

  // List concatenation: List<A> + List<B> = List<A V B>. NeverType is the join identity.
  if (types.every(isListType)) {
    const elements = types.map(extractListElementType)
    const nonNever = elements.filter((e) => e._tag !== "NeverType")
    const joined = nonNever.length > 0 ? nonNever[0] : elements[0]
    return ListType(joined)
  }

  // String concatenation: a String operand anywhere makes the whole expression a String.
  if (types.some((t) => t._tag === "ScalarType" && t.scalarType === "String")) {
    return new ScalarType({ scalarType: "String" })
  }

  // Numeric: unify operands (Long + Double = Double). Non-numeric (dates/durations) keep the
  // leading operand's type, preserving prior behavior.
  return numericJoin(types) ?? types[0]
}

/** multDivExpression: powerExpression ((MULT | DIV | MOD) powerExpression)* */
function inferMultDivType(
  multDiv: MultDivExpressionContext,
  env: TypeEnv,
  schema: GraphSchema
): CypherType {
  const powers = multDiv.powerExpression()
  if (powers.length === 1) return inferPowerType(powers[0], env, schema)
  const types = powers.map((p) => inferPowerType(p, env, schema))
  // Long * Long → Long and Long / Long → Long match Cypher integer arithmetic; any Double widens.
  return numericJoin(types) ?? types[0]
}

/** powerExpression: unaryAddSubExpression (CARET unaryAddSubExpression)* */
function inferPowerType(
  power: PowerExpressionContext,
  env: TypeEnv,
  schema: GraphSchema
): CypherType {
  const unaries = power.unaryAddSubExpression()
  if (unaries.length === 1) return inferUnaryType(unaries[0], env, schema)
  const types = unaries.map((u) => inferUnaryType(u, env, schema))
  // Cypher exponentiation (^) returns Float for numeric operands.
  return numericJoin(types) ? new ScalarType({ scalarType: "Double" }) : types[0]
}

/** unaryAddSubExpression: (PLUS | SUB)? atomicExpression — sign does not change the type. */
function inferUnaryType(
  unary: UnaryAddSubExpressionContext,
  env: TypeEnv,
  schema: GraphSchema
): CypherType {
  return inferAtomicType(unary.atomicExpression(), env, schema)
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
    const unwrapped = stripNullable(baseType)
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

/** Classify a numeric literal by its text: a decimal point, an exponent, or a float/double suffix
 *  means Double; everything else (plain integers, hex) is Long. The lexer's `DIGIT` token covers
 *  both integers and floats, so the int/float distinction lives here rather than in the grammar. */
function inferNumLitType(text: string): ScalarType {
  const t = text.replace(/^[+-]/, "")
  if (/[.]/.test(t) || /[eE]/.test(t) || /[fd]$/i.test(t)) {
    return new ScalarType({ scalarType: "Double" })
  }
  return new ScalarType({ scalarType: "Long" })
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
    const numLit = literal.numLit()
    if (numLit) return inferNumLitType(numLit.getText())
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

  // Parameter atom ($id): the param's value type isn't threaded into expression
  // inference, so fall back to a String scalar rather than failing the projection.
  if (atom.parameter()) {
    return new ScalarType({ scalarType: "String" })
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

/**
 * Join the result branches of a CASE into a single column type.
 *
 * ```
 *   payload  = join(strip(b₁), …, strip(bₙ))   -- NeverType is the join identity
 *   nullable = ∃i. bᵢ : NullableType(_)        -- a nullable branch
 *            ∨ ∃i. bᵢ : NeverType              -- a branch that is the `null` literal
 *   result   = nullable ? NullableType(payload) : payload
 * ```
 *
 * Stripping before wrapping keeps the result from double-wrapping. When every branch is null the
 * payload has no inhabitant, so the bare `NeverType` is returned rather than `NullableType(_)`.
 */
function joinCaseBranches(branches: ReadonlyArray<CypherType>): CypherType {
  const nullable = branches.some((b) => b._tag === "NullableType" || b._tag === "NeverType")
  const payloads = branches.map(stripNullable).filter((b) => b._tag !== "NeverType")
  if (payloads.length === 0) return new NeverType({})
  const payload = payloads[0]
  return nullable ? NullableType(payload) : payload
}

/** Narrow a `var IS NOT NULL` guard into the environment its branch is typed under. */
function narrowByGuard(guard: ExpressionContext | undefined, env: TypeEnv): TypeEnv {
  const narrowedVar = guard === undefined ? undefined : extractIsNotNullVar(guard)
  if (narrowedVar === undefined) return env
  const entry = env.get(narrowedVar)
  if (entry === undefined || !entry.nullable) return env
  return new Map([...env, [narrowedVar, { ...entry, nullable: false }]])
}

function inferCaseType(
  caseExpr: CaseExpressionContext,
  env: TypeEnv,
  schema: GraphSchema
): CypherType {
  // caseExpression: CASE expression? (WHEN expression THEN expression)+ (ELSE expression)? END
  //
  // The flat expression list interleaves the WHEN/THEN pairs, offset by one when the CASE carries a
  // scrutinee: with `base` expressions consumed by the scrutinee and n THEN keywords, the i-th THEN
  // sits at `base + 2i + 1` and the ELSE at `base + 2n`.
  const exprs = caseExpr.expression()
  const branchCount = caseExpr.THEN().length
  const hasElse = caseExpr.ELSE() !== null
  const armExpressionCount = branchCount * 2 + (hasElse ? 1 : 0)
  const base = exprs.length > armExpressionCount ? 1 : 0

  const firstThen = exprs[base + 1]
  if (branchCount === 0 || firstThen === undefined) {
    throw new CypherTypeError("CASE expression missing THEN branch")
  }

  const branches = [inferExpressionType(firstThen, narrowByGuard(exprs[base], env), schema)]
  if (hasElse) branches.push(inferExpressionType(exprs[base + 2 * branchCount], env, schema))

  return joinCaseBranches(branches)
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

/**
 * Unify two coalesce candidate types (already stripped of nullable). Equal scalars collapse to that
 * scalar; two numeric scalars (Long/Double in any mix) collapse to Long — the integer-tolerant
 * decoder is the numeric superset, accepting both database integers and floats. Anything else keeps
 * the leading argument's type (no regression for heterogeneous or non-scalar candidates).
 */
function unifyCoalesce(a: CypherType, b: CypherType): CypherType {
  if (a._tag === "ScalarType" && b._tag === "ScalarType") {
    if (a.scalarType === b.scalarType) return a
    const isNumeric = (s: string) => s === "Long" || s === "Double"
    if (isNumeric(a.scalarType) && isNumeric(b.scalarType)) return new ScalarType({ scalarType: "Long" })
  }
  return a
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
      const elementType = stripNullable(argType)
      return ListType(elementType)
    }
    throw new CypherTypeError("collect() requires an argument")
  }

  // coalesce(x, ...) → coalesce returns the first non-null argument, so the result type unifies the
  // candidates left→right, each stripped of nullable. Walk arguments until the first non-nullable one
  // (later arguments are unreachable). An integer-literal fallback for a nullable Double widens the
  // result to Long: when the property is null the runtime yields that integer literal, and only the
  // integer-tolerant decoder accepts it (it also passes floats through unchanged).
  if (funcName === "coalesce") {
    if (args.length === 0) throw new CypherTypeError("coalesce() requires arguments")
    let result: CypherType | undefined
    for (const arg of args) {
      const argType = inferExpressionType(arg, env, schema)
      const stripped = stripNullable(argType)
      result = result === undefined ? stripped : unifyCoalesce(result, stripped)
      if (argType._tag !== "NullableType") break
    }
    return result!
  }

  // properties(x) → Map with unknown fields
  if (funcName === "properties") return MapType([])

  // type(r) → String
  if (funcName === "type") return new ScalarType({ scalarType: "String" })

  // keys(x), labels(x) → List<String>
  if (funcName === "keys" || funcName === "labels") {
    return ListType(new ScalarType({ scalarType: "String" }))
  }

  // abs(x) preserves the numeric type of its argument (abs(Long) → Long, abs(Double) → Double),
  // unlike the fixed-return math functions in AGGREGATE_RETURN_TYPES.
  if (funcName === "abs") {
    if (args.length === 0) throw new CypherTypeError("abs() requires an argument")
    const argType = inferExpressionType(args[0], env, schema)
    return stripNullable(argType)
  }

  // Known aggregates / conversion functions
  const known = AGGREGATE_RETURN_TYPES[funcName]
  if (known) return known

  throw new CypherTypeError(`Unrecognized function '${funcName}'`)
}
