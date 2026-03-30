import { CharStream, CommonTokenStream } from "antlr4ng"
import { CypherLexer } from "./generated-parser/CypherLexer.js"
import {
  CypherParser,
  MatchStContext,
  WithStContext,
  ReadingStatementContext,
  type ReturnStContext,
} from "./generated-parser/CypherParser.js"
import type { GraphSchema } from "../schema/GraphSchemaModel"
import { NodeType, UnknownType, type CypherType } from "../types/CypherType"
import { inferExpressionType, type TypeEnv } from "./InferType"

// ── Public types ──

// Kept for backward compat with param extraction (params stay flat)
export type Neo4jType =
  | "String" | "Long" | "Double" | "Boolean"
  | "Date" | "DateTime" | "LocalDateTime" | "LocalTime" | "Time" | "Duration" | "Point"
  | "StringArray" | "LongArray" | "DoubleArray" | "BooleanArray"
  | "Unknown"

export interface ResolvedColumn {
  readonly name: string
  readonly type: CypherType
  readonly nullable: boolean
}

export interface ResolvedParam {
  readonly name: string
  readonly type: Neo4jType
}

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
    case "STRING": return "String"
    case "LONG": case "INTEGER": return "Long"
    case "FLOAT": case "DOUBLE": return "Double"
    case "BOOLEAN": return "Boolean"
    case "DATE": return "Date"
    case "DATETIME": case "ZONED DATETIME": return "DateTime"
    case "LOCAL DATETIME": return "LocalDateTime"
    case "LOCAL TIME": return "LocalTime"
    case "TIME": case "ZONED TIME": return "Time"
    case "DURATION": return "Duration"
    case "POINT": return "Point"
    case "STRINGARRAY": case "LIST<STRING>": case "LIST<STRING NOT NULL>": return "StringArray"
    case "LONGARRAY": case "LIST<LONG>": case "LIST<LONG NOT NULL>": case "LIST<INTEGER>": case "LIST<INTEGER NOT NULL>": return "LongArray"
    case "DOUBLEARRAY": case "LIST<FLOAT>": case "LIST<FLOAT NOT NULL>": case "LIST<DOUBLE>": case "LIST<DOUBLE NOT NULL>": return "DoubleArray"
    case "BOOLEANARRAY": case "LIST<BOOLEAN>": case "LIST<BOOLEAN NOT NULL>": return "BooleanArray"
    default:
      if (upper.startsWith("LIST<STRING")) return "StringArray"
      if (upper.startsWith("LIST<")) return "StringArray"
      return "String"
  }
}

function lookupParamType(schema: GraphSchema, label: string, propertyName: string): Neo4jType | undefined {
  const prop = schema.nodeProperties.find(
    (p) => p.labels.includes(label) && p.propertyName === propertyName,
  )
  if (!prop) return undefined
  const rawType = prop.propertyTypes[0]
  if (!rawType) return undefined
  return normalizeNeo4jType(rawType)
}

// ── TypeEnv helpers ──

function extendEnvFromMatch(env: TypeEnv, matchSt: MatchStContext): TypeEnv {
  const isOptional = matchSt.OPTIONAL() !== null
  const newEnv = new Map(env)

  // Walk all node patterns in this MATCH
  const patternWhere = matchSt.patternWhere()
  if (!patternWhere) return newEnv

  const patterns = patternWhere.pattern()?.patternPart() ?? []
  for (const part of patterns) {
    visitNodePatterns(part, (varName, label) => {
      newEnv.set(varName, { type: new NodeType({ label }), nullable: isOptional })
    })
  }
  return newEnv
}

function visitNodePatterns(
  node: any,
  cb: (varName: string, label: string) => void,
): void {
  if (!node) return
  // Check if this is a nodePattern
  if (node.constructor.name === "NodePatternContext") {
    const sym = node.symbol?.()
    const labels = node.nodeLabels?.()
    if (sym && labels) {
      const varName = sym.getText()
      const label = labels.getText().replace(/^:/, "")
      cb(varName, label)
    }
  }
  // Recurse into children
  const count = node.getChildCount?.() ?? 0
  for (let i = 0; i < count; i++) {
    visitNodePatterns(node.getChild(i), cb)
  }
}

function computeEnvFromProjection(
  projBody: ReturnType<WithStContext["projectionBody"]>,
  env: TypeEnv,
  schema: GraphSchema,
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
  schema: GraphSchema,
): ResolvedColumn[] {
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

interface ParamUsage { paramName: string; label?: string; property?: string }

function extractParams(tree: ReturnType<typeof parse>, schema: GraphSchema): ResolvedParam[] {
  const paramUsages: ParamUsage[] = []

  // Walk all node patterns looking for property constraints with params
  function visit(node: any) {
    if (!node) return
    if (node.constructor.name === "NodePatternContext") {
      const sym = node.symbol?.()
      const labels = node.nodeLabels?.()
      const props = node.properties?.()
      if (sym && labels && props) {
        const label = labels.getText().replace(/^:/, "")
        const text = props.getText()
        const paramRe = /(\w+):\$(\w+)/g
        for (const match of text.matchAll(paramRe)) {
          paramUsages.push({ paramName: match[2], label, property: match[1] })
        }
      }
    }
    const count = node.getChildCount?.() ?? 0
    for (let i = 0; i < count; i++) {
      visit(node.getChild(i))
    }
  }
  visit(tree)

  return paramUsages.map((usage) => {
    if (usage.label && usage.property) {
      const type = lookupParamType(schema, usage.label, usage.property)
      if (type) return { name: usage.paramName, type }
    }
    return { name: usage.paramName, type: "String" as Neo4jType }
  })
}

// ── Public API ──

export const analyzeQuery = (cypher: string, schema: GraphSchema): QueryAnalysis => {
  const tree = parse(cypher)
  const singleQuery = tree.query()!.regularQuery()!.singleQuery()!
  const multi = singleQuery.multiPartQ()
  const single = multi?.singlePartQ() ?? singleQuery.singlePartQ()!

  let env: TypeEnv = new Map()

  if (multi) {
    // Walk children in order: MATCH extends env, WITH recomputes env
    const children = multi.children ?? []
    for (const child of children) {
      if (child instanceof ReadingStatementContext) {
        const matchSt = child.matchSt()
        if (matchSt) env = extendEnvFromMatch(env, matchSt)
      } else if (child instanceof MatchStContext) {
        env = extendEnvFromMatch(env, child)
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
      if (matchSt) {
        env = extendEnvFromMatch(env, matchSt)
      }
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
