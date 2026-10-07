/** @since 0.0.1 */
import type { GraphSchema } from "@evryg/effect-neo4j-schema"
import { CharStream, CommonTokenStream } from "antlr4ng"
import * as antlr from "antlr4ng"
import { CypherLexer } from "../internal/generated-parser/CypherLexer.js"
import {
  CypherParser,
  type ExpressionContext,
  type FilterExpressionContext,
  FilterWithContext,
  ListComprehensionContext,
  ListExpressionContext,
  MapLitContext,
  type MatchStContext,
  MultiPartQContext,
  NodePatternContext,
  ParameterContext,
  PatternComprehensionContext,
  PatternElemContext,
  type ProjectionBodyContext,
  type PropertiesContext,
  PropertyExpressionContext,
  type QueryCallStContext,
  ReadingStatementContext,
  ReduceExpressionContext,
  type RegularQueryContext,
  RelationDetailContext,
  type RelationshipPatternContext,
  ReturnStContext,
  SetItemContext,
  SinglePartQContext,
  SingleQueryContext,
  SubqueryBodyContext,
  type UnwindStContext,
  UpdatingStatementContext,
  WithStContext
} from "../internal/generated-parser/CypherParser.js"
import { type CypherType, EdgeType, ScalarType, UnknownType, VertexType, VertexUnionType } from "../types/CypherType.js"
import {
  accessGraphElementProperty,
  CypherTypeError,
  inferExpressionType,
  isGraphElementType,
  type TypeEnv
} from "./InferType.js"

// ── Public types ──

// Kept for backward compat with param extraction (params stay flat)
/**
 * @since 0.0.1
 * @category models
 */
export type Neo4jType =
  | "String"
  | "Long"
  | "Double"
  | "Boolean"
  | "Date"
  | "DateTime"
  | "LocalDateTime"
  | "LocalTime"
  | "Time"
  | "Duration"
  | "Point"
  | "StringArray"
  | "LongArray"
  | "DoubleArray"
  | "BooleanArray"
  | "Unknown"

/**
 * @since 0.0.1
 * @category models
 */
export interface ResolvedColumn {
  readonly name: string
  readonly type: CypherType
  readonly nullable: boolean
}

/**
 * @since 0.0.1
 * @category models
 */
export interface ResolvedParam {
  readonly name: string
  readonly type: Neo4jType
  readonly nullable: boolean
}

/**
 * @since 0.0.1
 * @category models
 */
export interface QueryAnalysis {
  readonly columns: ReadonlyArray<ResolvedColumn>
  readonly params: ReadonlyArray<ResolvedParam>
}

/**
 * Raised when a query cannot be parsed at all, as opposed to parsing into a
 * tree whose types do not check (`CypherTypeError`).
 *
 * @since 0.6.0
 * @category errors
 */
export class CypherSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CypherSyntaxError"
  }
}

// ── ANTLR parsing ──

class SyntaxErrorCollector extends antlr.BaseErrorListener {
  readonly diagnostics: Array<string> = []

  override syntaxError<S extends antlr.Token, T extends antlr.ATNSimulator>(
    _recognizer: antlr.Recognizer<T>,
    offendingSymbol: S | null,
    line: number,
    column: number,
    message: string
  ): void {
    const token = offendingSymbol?.text
    this.diagnostics.push(`line ${line}:${column} ${message}${token === undefined ? "" : ` (at '${token}')`}`)
  }
}

function parse(cypher: string) {
  const input = CharStream.fromString(cypher)
  const lexer = new CypherLexer(input)
  const collector = new SyntaxErrorCollector()
  lexer.removeErrorListeners()
  lexer.addErrorListener(collector)
  const tokens = new CommonTokenStream(lexer)
  const parser = new CypherParser(tokens)
  parser.removeErrorListeners()
  parser.addErrorListener(collector)
  const tree = parser.script()
  if (collector.diagnostics.length > 0) {
    throw new CypherSyntaxError(`Cannot parse Cypher query:\n${collector.diagnostics.join("\n")}`)
  }
  return tree
}

// ── Schema lookup (for params — stays flat) ──

function normalizeNeo4jType(raw: string): Neo4jType {
  const upper = raw.toUpperCase().replace(/ NOT NULL/g, "").trim()
  switch (upper) {
    case "STRING":
      return "String"
    case "LONG":
    case "INTEGER":
      return "Long"
    case "FLOAT":
    case "DOUBLE":
      return "Double"
    case "BOOLEAN":
      return "Boolean"
    case "DATE":
      return "Date"
    case "DATETIME":
    case "ZONED DATETIME":
      return "DateTime"
    case "LOCAL DATETIME":
      return "LocalDateTime"
    case "LOCAL TIME":
      return "LocalTime"
    case "TIME":
    case "ZONED TIME":
      return "Time"
    case "DURATION":
      return "Duration"
    case "POINT":
      return "Point"
    case "STRINGARRAY":
    case "LIST<STRING>":
    case "LIST<STRING NOT NULL>":
      return "StringArray"
    case "LONGARRAY":
    case "LIST<LONG>":
    case "LIST<LONG NOT NULL>":
    case "LIST<INTEGER>":
    case "LIST<INTEGER NOT NULL>":
      return "LongArray"
    case "DOUBLEARRAY":
    case "LIST<FLOAT>":
    case "LIST<FLOAT NOT NULL>":
    case "LIST<DOUBLE>":
    case "LIST<DOUBLE NOT NULL>":
      return "DoubleArray"
    case "BOOLEANARRAY":
    case "LIST<BOOLEAN>":
    case "LIST<BOOLEAN NOT NULL>":
      return "BooleanArray"
    default:
      if (upper.startsWith("LIST<STRING")) return "StringArray"
      if (upper.startsWith("LIST<")) return "StringArray"
      return "String"
  }
}

function lookupParamType(
  schema: GraphSchema,
  label: string,
  propertyName: string
): { type: Neo4jType; nullable: boolean } | undefined {
  const prop = schema.vertexProperties.find(
    (p) => p.labels.includes(label) && p.propertyName === propertyName
  )
  if (!prop) return undefined
  const rawType = prop.propertyTypes[0]
  if (!rawType) return undefined
  // An optional vertex property accepts null (e.g. to clear it), so a param
  // bound to it must allow null too — matching the RETURN-row NullOr treatment.
  return { type: normalizeNeo4jType(rawType), nullable: !prop.mandatory }
}

function scalarToArrayType(scalar: Neo4jType): Neo4jType {
  switch (scalar) {
    case "String":
      return "StringArray"
    case "Long":
      return "LongArray"
    case "Double":
      return "DoubleArray"
    case "Boolean":
      return "BooleanArray"
    default:
      return "StringArray"
  }
}

// ── TypeEnv helpers ──

function extendEnvFromMatch(env: TypeEnv, matchSt: MatchStContext, schema: GraphSchema): TypeEnv {
  return extendEnvFromPattern(
    env,
    matchSt.patternWhere()?.pattern()?.patternPart() ?? [],
    schema,
    matchSt.OPTIONAL() !== null
  )
}

function extendEnvFromPattern(
  env: TypeEnv,
  patterns: ReadonlyArray<antlr.ParserRuleContext>,
  schema: GraphSchema,
  isOptional: boolean
): TypeEnv {
  const newEnv = new Map(env)

  // Pass 1: bind labeled nodes and edges
  for (const part of patterns) {
    visitNodePatterns(
      part,
      (varName, label) => {
        if (label) {
          newEnv.set(varName, { type: new VertexType({ label }), nullable: isOptional })
        } else if (!newEnv.has(varName)) {
          // Unlabeled node — bind as UnknownType initially (refined in pass 2)
          newEnv.set(varName, { type: new UnknownType({}), nullable: isOptional })
        }
      },
      (varName, edgeType) => {
        newEnv.set(varName, { type: new EdgeType({ edgeType }), nullable: isOptional })
      }
    )
  }

  // Pass 2: refine unlabeled nodes using edge connectivity
  if (schema.edgeConnectivity.length > 0) {
    for (const part of patterns) {
      refineUnlabeledNodesFromConnectivity(part, newEnv, schema, isOptional)
    }
  }

  return newEnv
}

// Bind variables introduced by CREATE/MERGE patterns. Unlike OPTIONAL MATCH, a
// created/merged node always exists, so its binding is never nullable.
// DELETE/SET/REMOVE bind nothing, and FOREACH binds only inside its own body.
function extendEnvFromCreate(env: TypeEnv, updatingSt: UpdatingStatementContext): TypeEnv {
  const createSt = updatingSt.createSt()
  const mergeSt = updatingSt.mergeSt()

  const parts = createSt
    ? createSt.pattern().patternPart()
    : mergeSt
    ? [mergeSt.patternPart()]
    : []
  if (parts.length === 0) return env

  const newEnv = new Map(env)
  for (const part of parts) {
    visitNodePatterns(part, (varName, label) => {
      if (label) {
        newEnv.set(varName, { type: new VertexType({ label }), nullable: false })
      }
    })
  }
  return newEnv
}

function visitNodePatterns(
  node: antlr.ParserRuleContext,
  cb: (varName: string, label: string) => void,
  relCb?: (varName: string, relType: string) => void
): void {
  // Check if this is a nodePattern
  if (node instanceof NodePatternContext) {
    const sym = node.symbol()
    const labels = node.nodeLabels()
    if (sym && labels) {
      const varName = sym.getText()
      const label = labels.getText().replace(/^:/, "")
      cb(varName, label)
    } else if (sym && !labels) {
      // Unlabeled node: bind as empty label (caller handles as UnknownType)
      cb(sym.getText(), "")
    }
  }
  // Check if this is a relationshipPattern with a variable and type
  if (relCb && node instanceof RelationDetailContext) {
    const sym = node.symbol()
    const relTypes = node.relationshipTypes()
    if (sym && relTypes) {
      const varName = sym.getText()
      const relType = relTypes.getText().replace(/^:/, "")
      relCb(varName, relType)
    }
  }
  // Recurse into children
  for (let i = 0; i < node.getChildCount(); i++) {
    const child = node.getChild(i)
    if (child instanceof antlr.ParserRuleContext) {
      visitNodePatterns(child, cb, relCb)
    }
  }
}

// ── Edge connectivity inference ──
//
// Walks pattern chains (nodePattern → (relPattern, nodePattern)*) to find
// unlabeled nodes adjacent to labeled nodes via typed edges. Uses the schema's
// edge connectivity model to resolve the set of possible target labels.
//
// Inference rule:
//   MATCH (a:L1)-[r:E]->(b)     where b has no label
//   connectivity(E) = { (from, to) | ... }
//   targets = { to | (from, to) ∈ connectivity(E), from = L1 }
//
//   |targets| = 1  ⟹  env(b) = VertexType(targets[0])
//   |targets| > 1  ⟹  env(b) = VertexUnionType(targets)
//   |targets| = 0  ⟹  keep existing binding (UnknownType)
//

function refineUnlabeledNodesFromConnectivity(
  part: antlr.ParserRuleContext,
  env: Map<string, { type: CypherType; nullable: boolean }>,
  schema: GraphSchema,
  isOptional: boolean
): void {
  walkPatternChains(part, (segments) => {
    for (let i = 0; i < segments.length - 1; i++) {
      const leftNode = segments[i]
      const { hasLeftArrow, hasRightArrow, relType } = segments[i].relToNext!
      const rightNode = segments[i + 1]

      if (!relType) continue

      // Determine source/target based on arrow direction
      // (a)-[r:E]->(b): left is source, right is target (hasRightArrow)
      // (a)<-[r:E]-(b): right is source, left is target (hasLeftArrow)
      const pairs: Array<{ sourceNode: typeof leftNode; targetNode: typeof rightNode }> = []

      if (hasRightArrow && !hasLeftArrow) {
        pairs.push({ sourceNode: leftNode, targetNode: rightNode })
      } else if (hasLeftArrow && !hasRightArrow) {
        pairs.push({ sourceNode: rightNode, targetNode: leftNode })
      } else {
        // Undirected or bidirectional — try both directions
        pairs.push({ sourceNode: leftNode, targetNode: rightNode })
        pairs.push({ sourceNode: rightNode, targetNode: leftNode })
      }

      for (const { sourceNode, targetNode } of pairs) {
        if (!targetNode.varName) continue
        const targetEntry = env.get(targetNode.varName)
        if (!targetEntry || targetEntry.type._tag !== "UnknownType") continue

        // Resolve source label from env or from the pattern
        const sourceLabel = sourceNode.label
          ?? (sourceNode.varName ? getLabelFromEnv(env, sourceNode.varName) : undefined)
        if (!sourceLabel) continue

        // Look up connectivity: find all target labels for this edge type + source label
        const targetLabels = schema.edgeConnectivity
          .filter((c) => c.edgeType === relType && c.fromLabel === sourceLabel)
          .map((c) => c.toLabel)

        if (targetLabels.length === 1) {
          env.set(targetNode.varName, {
            type: new VertexType({ label: targetLabels[0] }),
            nullable: isOptional
          })
        } else if (targetLabels.length > 1) {
          env.set(targetNode.varName, {
            type: new VertexUnionType({ labels: targetLabels }),
            nullable: isOptional
          })
        }
      }
    }
  })
}

function getLabelFromEnv(
  env: ReadonlyMap<string, { type: CypherType; nullable: boolean }>,
  varName: string
): string | undefined {
  const entry = env.get(varName)
  if (!entry) return undefined
  if (entry.type._tag === "VertexType") return entry.type.label
  return undefined
}

interface ChainNode {
  varName: string | undefined
  label: string | undefined
  relToNext?: { relType: string | undefined; hasLeftArrow: boolean; hasRightArrow: boolean } | undefined
}

/** Walk all pattern element chains, calling cb with the ordered list of nodes */
function walkPatternChains(
  node: antlr.ParserRuleContext,
  cb: (segments: Array<ChainNode>) => void
): void {
  // PatternElemContext: nodePattern patternElemChain*
  if (node instanceof PatternElemContext) {
    const firstNodeCtx = node.nodePattern()
    const chains = node.patternElemChain()
    if (firstNodeCtx && chains.length > 0) {
      const segments: Array<ChainNode> = []
      segments.push(extractChainNode(firstNodeCtx))

      for (const chain of chains) {
        const relCtx = chain.relationshipPattern()
        const nextNodeCtx = chain.nodePattern()
        if (!nextNodeCtx) continue

        // Annotate previous segment with relationship info
        const prev = segments[segments.length - 1]
        prev.relToNext = extractRelInfo(relCtx)

        segments.push(extractChainNode(nextNodeCtx))
      }
      cb(segments)
    }
  }

  // Recurse into children
  for (let i = 0; i < node.getChildCount(); i++) {
    const child = node.getChild(i)
    if (child instanceof antlr.ParserRuleContext) {
      walkPatternChains(child, cb)
    }
  }
}

function extractChainNode(nodeCtx: NodePatternContext): ChainNode {
  const sym = nodeCtx.symbol()
  const labels = nodeCtx.nodeLabels()
  return {
    varName: sym?.getText() ?? undefined,
    label: labels ? labels.getText().replace(/^:/, "") : undefined
  }
}

function extractRelInfo(relCtx: RelationshipPatternContext | null): ChainNode["relToNext"] {
  if (!relCtx) return { relType: undefined, hasLeftArrow: false, hasRightArrow: false }
  const detail = relCtx.relationDetail()
  const relTypes = detail?.relationshipTypes()
  const relType = relTypes ? relTypes.getText().replace(/^:/, "") : undefined
  return {
    relType,
    hasLeftArrow: relCtx.LT() !== null && relCtx.LT() !== undefined,
    hasRightArrow: relCtx.GT() !== null && relCtx.GT() !== undefined
  }
}

function extendEnvFromUnwind(env: TypeEnv, unwindSt: UnwindStContext, schema: GraphSchema): TypeEnv {
  const newEnv = new Map(env)
  const expr = unwindSt.expression()
  const sym = unwindSt.symbol()
  if (!expr || !sym) return newEnv

  const listType = inferExpressionType(expr, newEnv, schema)
  // Extract element type from the list
  const unwrapped = listType._tag === "NullableType" ? listType.inner : listType
  const elemType = unwrapped._tag === "ListType" ? unwrapped.element : listType

  // If element could be a node type (from collecting nodes), bind it
  // If it's NeverType (from [null]), treat as nullable unknown
  const varName = sym.getText()
  const nullable = elemType._tag === "NeverType"
  newEnv.set(varName, { type: nullable ? new UnknownType({}) : elemType, nullable })

  return newEnv
}

// ── Fulltext/vector procedure result typing ──
//
// The index name is a string literal in the query, so this is a name lookup against the
// schema's fullTextIndexes, not general procedure-signature inference. A small static table
// covers the well-known builtins' YIELD shape so `score` types even without a schema hit.

const FULLTEXT_PROCEDURE_YIELD_TYPES: ReadonlyMap<string, ReadonlyArray<CypherType>> = new Map([
  ["db.index.fulltext.queryNodes", [new UnknownType({}), new ScalarType({ scalarType: "Double" })]],
  ["db.index.fulltext.queryRelationships", [new UnknownType({}), new ScalarType({ scalarType: "Double" })]],
  ["db.index.vector.queryNodes", [new UnknownType({}), new ScalarType({ scalarType: "Double" })]]
])

/** A bare single- or double-quoted string literal, with no operators or property access applied to it. */
function extractStringLiteral(expr: ExpressionContext | undefined): string | undefined {
  const match = expr?.getText().match(/^"([^"\\]*)"$|^'([^'\\]*)'$/)
  return match?.[1] ?? match?.[2]
}

function resolveFullTextTargetLabels(
  queryCallSt: QueryCallStContext,
  schema: GraphSchema
): ReadonlyArray<string> | undefined {
  const [nameArg] = queryCallSt.parenExpressionChain()?.expressionChain()?.expression() ?? []
  const indexName = extractStringLiteral(nameArg)
  if (indexName === undefined) return undefined
  const labels = schema.fullTextIndexes.find((index) => index.name === indexName)?.labels
  return labels && labels.length > 0 ? labels : undefined
}

function extendEnvFromQueryCall(env: TypeEnv, queryCallSt: QueryCallStContext, schema: GraphSchema): TypeEnv {
  const newEnv = new Map(env)
  const items = queryCallSt.yieldItems()?.yieldItem() ?? []
  const procedureName = queryCallSt.invocationName().getText()
  const builtinTypes = FULLTEXT_PROCEDURE_YIELD_TYPES.get(procedureName)
  const targetLabels = procedureName === "db.index.fulltext.queryNodes"
    ? resolveFullTextTargetLabels(queryCallSt, schema)
    : undefined

  for (const [i, item] of items.entries()) {
    const symbols = item.symbol_()
    const boundSymbol = symbols[symbols.length - 1]
    if (!boundSymbol) continue
    const targetType = i === 0 && targetLabels
      ? (targetLabels.length === 1
        ? new VertexType({ label: targetLabels[0] })
        : new VertexUnionType({ labels: targetLabels }))
      : undefined
    newEnv.set(boundSymbol.getText(), { type: targetType ?? builtinTypes?.[i] ?? new UnknownType({}), nullable: false })
  }

  return newEnv
}

function computeEnvFromProjection(
  projBody: ReturnType<WithStContext["projectionBody"]>,
  env: TypeEnv,
  schema: GraphSchema
): TypeEnv {
  const newEnv: Map<string, { type: CypherType; nullable: boolean }> = new Map()
  const items = projBody?.projectionItems()?.projectionItem() ?? []

  for (const item of items) {
    const aliasCtx = item.symbol()
    const exprCtx = item.expression()
    if (!exprCtx) continue

    const alias = aliasCtx ? aliasCtx.getText() : exprCtx.getText()
    let type = inferExpressionType(exprCtx, env, schema)
    let nullable = inferNullable(exprCtx.getText(), env)

    // Unwrap top-level NullableType into the env entry's nullable flag
    if (type._tag === "NullableType") {
      nullable = true
      type = type.inner
    }

    newEnv.set(alias, { type, nullable })
  }

  return newEnv
}

/** Extract the root variable name from an expression (e.g. "c.fqcn" → "c", "count(*)" → null) */
function extractRootVariable(exprText: string): string | undefined {
  const match = exprText.match(/^(\w+)/)
  return match ? match[1] : undefined
}

function inferNullable(exprText: string, env: TypeEnv): boolean {
  const rootVar = extractRootVariable(exprText)
  if (!rootVar) return false
  const entry = env.get(rootVar)
  return entry?.nullable ?? false
}

function resolveProjection(
  items: ReadonlyArray<{ symbol(): { getText(): string } | null; expression(): { getText(): string } | null }>,
  env: TypeEnv,
  schema: GraphSchema
): Array<ResolvedColumn> {
  return items.map((item) => {
    const aliasCtx = item.symbol()
    const exprCtx = item.expression()
    if (!exprCtx) return { name: "", type: new UnknownType({}), nullable: true }

    const alias = aliasCtx ? aliasCtx.getText() : exprCtx.getText()
    let type = inferExpressionType(exprCtx as Parameters<typeof inferExpressionType>[0], env, schema)
    let nullable = inferNullable(exprCtx.getText(), env)

    // Unwrap top-level NullableType into the column's nullable flag
    if (type._tag === "NullableType") {
      nullable = true
      type = type.inner
    }

    return { name: alias, type, nullable }
  })
}

// ── Property-access typing ──
//
//   env(x) ∈ { Vertex(L), Edge(E), VertexUnion(Ls) }   ⟹   x.p is typed by accessGraphElementProperty
//
// in every clause, under the environment in effect at that clause. Any other binding (unbound,
// unlabeled, scalar, map, list) is left as is: nothing is known about its properties.

/** The type a binder gives its variable; an expression the inference cannot type binds an opaque variable. */
function bindingOf(expr: ExpressionContext, env: TypeEnv, schema: GraphSchema): CypherType {
  try {
    return inferExpressionType(expr, env, schema)
  } catch (error) {
    if (error instanceof CypherTypeError) return new UnknownType({})
    throw error
  }
}

function elementBindingOf(list: ExpressionContext, env: TypeEnv, schema: GraphSchema) {
  const listType = bindingOf(list, env, schema)
  const unwrapped = listType._tag === "NullableType" ? listType.inner : listType
  return { type: unwrapped._tag === "ListType" ? unwrapped.element : new UnknownType({}), nullable: false }
}

function checkPropertyExpression(propExpr: PropertyExpressionContext, env: TypeEnv, schema: GraphSchema): void {
  const symbol = propExpr.atom().symbol()
  const firstName = propExpr.propertyPostfix()[0]?.name()
  if (!symbol || !firstName) return
  const binding = env.get(symbol.getText())?.type
  if (binding && isGraphElementType(binding)) accessGraphElementProperty(binding, firstName.getText(), schema)
}

/** An expression that is nothing but a map literal: a chain of single-child nodes ending in one. */
function bareMapLiteral(node: antlr.ParserRuleContext): MapLitContext | undefined {
  if (node instanceof MapLitContext) return node
  const only = node.getChildCount() === 1 ? node.getChild(0) : null
  return only instanceof antlr.ParserRuleContext ? bareMapLiteral(only) : undefined
}

/** `SET x = {p: v}` and `SET x += {p: v}` write `p` on `x`, exactly as `SET x.p = v` does. */
function checkSetFromMapLiteral(item: SetItemContext, env: TypeEnv, schema: GraphSchema): void {
  const target = item.propertyExpression()
  const symbol = item.symbol() ?? (target?.propertyPostfix().length === 0 ? target.atom().symbol() : null)
  const value = item.expression()
  const map = value ? bareMapLiteral(value) : undefined
  const owner = symbol ? env.get(symbol.getText())?.type : undefined
  if (!map || !owner || !isGraphElementType(owner)) return
  for (const pair of map.mapPair()) accessGraphElementProperty(owner, pair.name().getText(), schema)
}

/** `(x:L {p: v})` and `[r:E {p: v}]` access `p` on the element they match, exactly as `x.p` does. */
function checkPatternPropertyMap(
  owner: CypherType | undefined,
  properties: PropertiesContext | null,
  schema: GraphSchema
): void {
  if (!owner || !isGraphElementType(owner)) return
  for (const pair of properties?.mapLit()?.mapPair() ?? []) {
    accessGraphElementProperty(owner, pair.name().getText(), schema)
  }
}

function nodePatternElement(node: NodePatternContext, env: TypeEnv): CypherType | undefined {
  const labels = node.nodeLabels()
  if (labels) return new VertexType({ label: labels.getText().replace(/^:/, "") })
  const symbol = node.symbol()
  return symbol ? env.get(symbol.getText())?.type : undefined
}

function relationshipPatternElement(detail: RelationDetailContext, env: TypeEnv): CypherType | undefined {
  const relTypes = detail.relationshipTypes()
  if (relTypes) return new EdgeType({ edgeType: relTypes.getText().replace(/^:/, "") })
  const symbol = detail.symbol()
  return symbol ? env.get(symbol.getText())?.type : undefined
}

/** `x IN list WHERE pred`, then `bodies`: `list` is typed in `outer`, the predicate and bodies in `env` plus `x`. */
function checkFilterScope(
  filter: FilterExpressionContext,
  bodies: ReadonlyArray<antlr.ParserRuleContext | null>,
  env: TypeEnv,
  schema: GraphSchema,
  outer: TypeEnv = env
): void {
  checkPropertyAccesses(filter.expression(), outer, schema)
  const inner: TypeEnv = new Map([
    ...env,
    [filter.symbol().getText(), elementBindingOf(filter.expression(), outer, schema)]
  ])
  for (const scoped of [filter.where(), ...bodies]) {
    if (scoped) checkPropertyAccesses(scoped, inner, schema)
  }
}

function checkPropertyAccesses(node: antlr.ParserRuleContext, env: TypeEnv, schema: GraphSchema): void {
  if (node instanceof ListComprehensionContext) {
    return checkFilterScope(node.filterExpression(), [node.expression()], env, schema)
  }
  if (node instanceof FilterWithContext) return checkFilterScope(node.filterExpression(), [], env, schema)
  if (node instanceof ReduceExpressionContext) {
    const [init, body] = node.expression()
    checkPropertyAccesses(init, env, schema)
    const accumulator = { type: bindingOf(init, env, schema), nullable: false }
    const withAccumulator: TypeEnv = new Map([...env, [node.symbol().getText(), accumulator]])
    return checkFilterScope(node.filterExpression(), [body], withAccumulator, schema, env)
  }
  if (node instanceof PatternComprehensionContext) {
    const chain = node.relationshipsChainPattern()
    const inner = extendEnvFromPattern(env, [chain], schema, false)
    for (const scoped of [chain, node.where(), node.expression()]) {
      if (scoped) checkPropertyAccesses(scoped, inner, schema)
    }
    return
  }
  if (node instanceof SubqueryBodyContext) return typeSubqueryBody(node, env, schema)
  if (node instanceof PropertyExpressionContext) checkPropertyExpression(node, env, schema)
  if (node instanceof SetItemContext) checkSetFromMapLiteral(node, env, schema)
  if (node instanceof NodePatternContext) {
    checkPatternPropertyMap(nodePatternElement(node, env), node.properties(), schema)
  }
  if (node instanceof RelationDetailContext) {
    checkPatternPropertyMap(relationshipPatternElement(node, env), node.properties(), schema)
  }
  for (let i = 0; i < node.getChildCount(); i++) {
    const child = node.getChild(i)
    if (child instanceof antlr.ParserRuleContext) checkPropertyAccesses(child, env, schema)
  }
}

/** Projection items see the incoming scope; ORDER BY also sees the projected aliases, which shadow it. */
function checkProjectionBody(body: ProjectionBodyContext, env: TypeEnv, schema: GraphSchema): void {
  checkPropertyAccesses(body.projectionItems(), env, schema)
  for (const paging of [body.skipSt(), body.limitSt()]) {
    if (paging) checkPropertyAccesses(paging, env, schema)
  }
  const orderSt = body.orderSt()
  if (orderSt) {
    const projected = computeEnvFromProjection(body, env, schema)
    checkPropertyAccesses(orderSt, new Map([...env, ...projected]), schema)
  }
}

/** Threads the type environment through a query's clauses, typing every property access on the way.
 *  Returns the environment the final RETURN projects from. */
function typeClauses(clauses: ReadonlyArray<antlr.ParseTree>, env: TypeEnv, schema: GraphSchema): TypeEnv {
  return clauses.reduce((current, clause) => typeClause(clause, current, schema), env)
}

/** Every branch of a UNION starts from the same scope. */
function typeRegularQuery(regular: RegularQueryContext, env: TypeEnv, schema: GraphSchema): TypeEnv {
  const [first, ...unions] = [regular.singleQuery(), ...regular.unionSt().map((union) => union.singleQuery())]
  for (const branch of unions) typeClauses([branch], env, schema)
  return typeClauses([first], env, schema)
}

/** EXISTS { ... } and COUNT { ... } see the enclosing scope and extend it with what their own patterns bind. */
function typeSubqueryBody(body: SubqueryBodyContext, env: TypeEnv, schema: GraphSchema): void {
  const regular = body.regularQuery()
  if (regular) {
    typeRegularQuery(regular, env, schema)
    return
  }
  const patternWhere = body.patternWhere()
  if (patternWhere) {
    const inner = extendEnvFromPattern(env, patternWhere.pattern().patternPart(), schema, false)
    checkPropertyAccesses(patternWhere, inner, schema)
    return
  }
  typeClauses(body.readingStatement(), env, schema)
}

function typeClause(clause: antlr.ParseTree, env: TypeEnv, schema: GraphSchema): TypeEnv {
  if (
    clause instanceof SingleQueryContext || clause instanceof MultiPartQContext || clause instanceof SinglePartQContext
  ) {
    return typeClauses(clause.children, env, schema)
  }
  if (clause instanceof ReadingStatementContext) return typeReadingStatement(clause, env, schema)
  if (clause instanceof UpdatingStatementContext) return typeUpdatingStatement(clause, env, schema)
  if (clause instanceof WithStContext) {
    const body = clause.projectionBody()
    checkProjectionBody(body, env, schema)
    const projected = computeEnvFromProjection(body, env, schema)
    const where = clause.where()
    if (where) checkPropertyAccesses(where, projected, schema)
    return projected
  }
  if (clause instanceof ReturnStContext) checkProjectionBody(clause.projectionBody(), env, schema)
  return env
}

function typeReadingStatement(reading: ReadingStatementContext, env: TypeEnv, schema: GraphSchema): TypeEnv {
  const matchSt = reading.matchSt()
  if (matchSt) {
    const extended = extendEnvFromMatch(env, matchSt, schema)
    checkPropertyAccesses(matchSt, extended, schema)
    return extended
  }
  const unwindSt = reading.unwindSt()
  if (unwindSt) {
    checkPropertyAccesses(unwindSt.expression(), env, schema)
    return extendEnvFromUnwind(env, unwindSt, schema)
  }
  const queryCallSt = reading.queryCallSt()
  if (queryCallSt) {
    checkPropertyAccesses(queryCallSt.parenExpressionChain(), env, schema)
    const extended = extendEnvFromQueryCall(env, queryCallSt, schema)
    const where = queryCallSt.yieldItems()?.where()
    if (where) checkPropertyAccesses(where, extended, schema)
    return extended
  }
  return env
}

function typeUpdatingStatement(updating: UpdatingStatementContext, env: TypeEnv, schema: GraphSchema): TypeEnv {
  const foreachSt = updating.foreachSt()
  if (foreachSt) {
    checkPropertyAccesses(foreachSt.expression(), env, schema)
    const element = elementBindingOf(foreachSt.expression(), env, schema)
    typeClauses(foreachSt.updatingStatement(), new Map([...env, [foreachSt.symbol().getText(), element]]), schema)
    return env
  }
  const extended = extendEnvFromCreate(env, updating)
  checkPropertyAccesses(updating, extended, schema)
  return extended
}

// ── Param extraction ──

interface ParamUsage {
  paramName: string
  label?: string | undefined
  property?: string | undefined
  isInClause?: boolean | undefined
}

/** Walk an ANTLR parse tree, calling cb for every node of the given context class. */
function walkTree<T extends antlr.ParserRuleContext>(
  node: antlr.ParserRuleContext,
  contextClass: new(...args: Array<never>) => T,
  cb: (ctx: T) => void
): void {
  if (node instanceof contextClass) cb(node)
  for (let i = 0; i < node.getChildCount(); i++) {
    const child = node.getChild(i)
    if (child instanceof antlr.ParserRuleContext) {
      walkTree(child, contextClass, cb)
    }
  }
}

/** Build a map of variable name → label from all (var:Label) patterns in the tree. */
function buildVarLabelMap(tree: antlr.ParserRuleContext): Map<string, string> {
  const varLabels = new Map<string, string>()
  walkTree(tree, NodePatternContext, (np) => {
    const sym = np.symbol()
    const labels = np.nodeLabels()
    if (sym && labels) {
      varLabels.set(sym.getText(), labels.getText().replace(/^:/, ""))
    }
  })
  return varLabels
}

/** Find the first ParameterContext ($param) within a subtree. */
function findParameter(ctx: antlr.ParserRuleContext): ParameterContext | null {
  if (ctx instanceof ParameterContext) return ctx
  for (let i = 0; i < ctx.getChildCount(); i++) {
    const child = ctx.getChild(i)
    if (child instanceof antlr.ParserRuleContext) {
      const found = findParameter(child)
      if (found) return found
    }
  }
  return null
}

function extractParams(tree: ReturnType<typeof parse>, schema: GraphSchema): Array<ResolvedParam> {
  const paramUsages: Array<ParamUsage> = []
  const seenParams = new Set<string>()
  const varLabels = buildVarLabelMap(tree)

  // Pass 1: Walk all node patterns looking for property constraints with params
  walkTree(tree, NodePatternContext, (np) => {
    const sym = np.symbol()
    const labels = np.nodeLabels()
    const props = np.properties()
    if (sym && labels && props) {
      const label = labels.getText().replace(/^:/, "")
      const text = props.getText()
      const paramRe = /(\w+):\$(\w+)/g
      for (const match of text.matchAll(paramRe)) {
        paramUsages.push({ paramName: match[2], label, property: match[1] })
        seenParams.add(match[2])
      }
    }
  })

  // Pass 2: Walk ListExpressionContext nodes for `expr.prop IN $param`
  // AST structure: parent(AtomicExpressionContext) has children:
  //   [0] PropertyOrLabelExpressionContext (LHS: c.fqcn)
  //   [1] ListExpressionContext (IN $param)
  walkTree(tree, ListExpressionContext, (listExpr) => {
    if (!listExpr.IN()) return

    // The $param is inside the ListExpressionContext's propertyOrLabelExpression
    const rhsPropExpr = listExpr.propertyOrLabelExpression()
    if (!rhsPropExpr) return
    const paramCtx = findParameter(rhsPropExpr)
    if (!paramCtx) return

    const paramSym = paramCtx.symbol()
    if (!paramSym) return
    const paramName = paramSym.getText()
    if (seenParams.has(paramName)) return
    seenParams.add(paramName)

    // The LHS (e.g., c.fqcn) is a sibling in the parent before the ListExpressionContext
    const parent = listExpr.parent
    if (!parent) {
      paramUsages.push({ paramName, isInClause: true })
      return
    }

    // Find the PropertyOrLabelExpressionContext sibling that comes before this ListExpressionContext
    let lhsText: string | undefined
    for (let i = 0; i < parent.getChildCount(); i++) {
      const child = parent.getChild(i)
      if (child === listExpr) break
      if (child instanceof antlr.ParserRuleContext) lhsText = child.getText()
    }

    if (!lhsText) {
      paramUsages.push({ paramName, isInClause: true })
      return
    }

    const dotIdx = lhsText.indexOf(".")
    if (dotIdx === -1) {
      paramUsages.push({ paramName, isInClause: true })
      return
    }
    const varName = lhsText.slice(0, dotIdx)
    const property = lhsText.slice(dotIdx + 1)
    const label = varLabels.get(varName)
    paramUsages.push({ paramName, label, property, isInClause: true })
  })

  // Pass 3: Walk SET items of the form `<var>.<prop> = $param`, mirroring Pass 1.
  // Only the `propertyExpression ASSIGN expression` alternative is handled; `SET r += $map`
  // (map-merge) uses the `symbol ADD_ASSIGN expression` alternative, whose propertyExpression()
  // is null, so it is naturally excluded — that map param is a separate feature.
  walkTree(tree, SetItemContext, (item) => {
    const propExpr = item.propertyExpression()
    if (!propExpr) return

    // LHS must be a simple `var.prop` (a single dot-access postfix, no indexing).
    const postfixes = propExpr.propertyPostfix()
    if (postfixes.length !== 1) return
    const nameCtx = postfixes[0]!.name()
    if (!nameCtx) return
    const varName = propExpr.atom().getText()
    const property = nameCtx.getText()

    const expr = item.expression()
    if (!expr) return
    const paramCtx = findParameter(expr)
    if (!paramCtx) return
    const paramSym = paramCtx.symbol()
    if (!paramSym) return
    const paramName = paramSym.getText()
    if (seenParams.has(paramName)) return
    seenParams.add(paramName)

    const label = varLabels.get(varName)
    paramUsages.push({ paramName, label, property })
  })

  return paramUsages.map((usage) => {
    if (usage.label && usage.property) {
      const resolved = lookupParamType(schema, usage.label, usage.property)
      if (resolved) {
        // IN-clause params are arrays of values, not the property itself, so they
        // are never nullable regardless of the property's optionality.
        return usage.isInClause
          ? { name: usage.paramName, type: scalarToArrayType(resolved.type), nullable: false }
          : { name: usage.paramName, type: resolved.type, nullable: resolved.nullable }
      }
    }
    return {
      name: usage.paramName,
      type: (usage.isInClause ? "StringArray" : "String") as Neo4jType,
      nullable: false
    }
  })
}

// ── Public API ──

/**
 * @since 0.0.1
 * @category analysis
 */
export const analyzeQuery = (cypher: string, schema: GraphSchema): QueryAnalysis => {
  const tree = parse(cypher)
  const regularQuery = tree.query().regularQuery()!
  const singleQuery = regularQuery.singleQuery()
  const single = singleQuery.multiPartQ()?.singlePartQ() ?? singleQuery.singlePartQ()!
  const env = typeRegularQuery(regularQuery, new Map(), schema)

  // Resolve RETURN columns
  const returnSt = single?.returnSt()
  const returnItems = returnSt?.projectionBody()?.projectionItems()?.projectionItem() ?? []
  const columns = resolveProjection(returnItems, env, schema)

  // Extract params
  const params = extractParams(tree, schema)

  return { columns, params }
}
