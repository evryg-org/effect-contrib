/** @since 0.0.1 */
import type { GraphSchema } from "@evryg/effect-neo4j-schema"
import { CharStream, CommonTokenStream } from "antlr4ng"
import * as antlr from "antlr4ng"
import { CypherLexer } from "../internal/generated-parser/CypherLexer.js"
import type { RelationshipPatternContext } from "../internal/generated-parser/CypherParser.js"
import {
  CypherParser,
  ListExpressionContext,
  MatchStContext,
  NodePatternContext,
  ParameterContext,
  PatternElemContext,
  ReadingStatementContext,
  RelationDetailContext,
  UnwindStContext,
  WithStContext
} from "../internal/generated-parser/CypherParser.js"
import { type CypherType, EdgeType, UnknownType, VertexType, VertexUnionType } from "../types/CypherType.js"
import { inferExpressionType, type TypeEnv } from "./InferType.js"

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
}

/**
 * @since 0.0.1
 * @category models
 */
export interface QueryAnalysis {
  readonly columns: ReadonlyArray<ResolvedColumn>
  readonly params: ReadonlyArray<ResolvedParam>
}

// ── ANTLR parsing ──

function parse(cypher: string) {
  const input = CharStream.fromString(cypher)
  const lexer = new CypherLexer(input)
  const tokens = new CommonTokenStream(lexer)
  const parser = new CypherParser(tokens)
  parser.removeErrorListeners()
  return parser.script()
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

function lookupParamType(schema: GraphSchema, label: string, propertyName: string): Neo4jType | undefined {
  const prop = schema.vertexProperties.find(
    (p) => p.labels.includes(label) && p.propertyName === propertyName
  )
  if (!prop) return undefined
  const rawType = prop.propertyTypes[0]
  if (!rawType) return undefined
  return normalizeNeo4jType(rawType)
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
  const isOptional = matchSt.OPTIONAL() !== null
  const newEnv = new Map(env)

  // Walk all node patterns in this MATCH
  const patternWhere = matchSt.patternWhere()
  if (!patternWhere) return newEnv

  const patterns = patternWhere.pattern()?.patternPart() ?? []

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

  return paramUsages.map((usage) => {
    if (usage.label && usage.property) {
      const type = lookupParamType(schema, usage.label, usage.property)
      if (type) {
        return { name: usage.paramName, type: usage.isInClause ? scalarToArrayType(type) : type }
      }
    }
    return { name: usage.paramName, type: (usage.isInClause ? "StringArray" : "String") as Neo4jType }
  })
}

// ── Public API ──

/**
 * @since 0.0.1
 * @category analysis
 */
export const analyzeQuery = (cypher: string, schema: GraphSchema): QueryAnalysis => {
  const tree = parse(cypher)
  const singleQuery = tree.query().regularQuery()!.singleQuery()
  const multi = singleQuery.multiPartQ()
  const single = multi?.singlePartQ() ?? singleQuery.singlePartQ()!

  let env: TypeEnv = new Map()

  if (multi) {
    // Walk children in order: MATCH extends env, WITH recomputes env
    const children = multi.children ?? []
    for (const child of children) {
      if (child instanceof ReadingStatementContext) {
        const matchSt = child.matchSt()
        if (matchSt) env = extendEnvFromMatch(env, matchSt, schema)
        const unwindSt = child.unwindSt()
        if (unwindSt) env = extendEnvFromUnwind(env, unwindSt, schema)
      } else if (child instanceof UnwindStContext) {
        env = extendEnvFromUnwind(env, child, schema)
      } else if (child instanceof MatchStContext) {
        env = extendEnvFromMatch(env, child, schema)
      } else if (child instanceof WithStContext) {
        env = computeEnvFromProjection(child.projectionBody(), env, schema)
      }
    }
  }

  // Process singlePartQ reading statements (MATCH, OPTIONAL MATCH)
  if (single) {
    const readings = single.readingStatement() ?? []
    for (const reading of readings) {
      const matchSt = reading.matchSt()
      if (matchSt) env = extendEnvFromMatch(env, matchSt, schema)
      const unwindSt = reading.unwindSt()
      if (unwindSt) env = extendEnvFromUnwind(env, unwindSt, schema)
    }
  }

  // Resolve RETURN columns
  const returnSt = single?.returnSt()
  const returnItems = returnSt?.projectionBody()?.projectionItems()?.projectionItem() ?? []
  const columns = resolveProjection(returnItems, env, schema)

  // Extract params
  const params = extractParams(tree, schema)

  return { columns, params }
}
