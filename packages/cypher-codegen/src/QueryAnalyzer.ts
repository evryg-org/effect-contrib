import { CharStream, CommonTokenStream, ParseTreeWalker } from "antlr4ng"
import { CypherLexer } from "./generated-parser/CypherLexer.js"
import { CypherParser, type MatchStContext, type NodePatternContext, type ReturnStContext, type WithStContext } from "./generated-parser/CypherParser.js"
import { CypherParserListener } from "./generated-parser/CypherParserListener.js"
import type { GraphSchema } from "./GraphSchemaModel"

// ── Public types ──

export type Neo4jScalarType =
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

export type Neo4jListType =
  | "StringArray"
  | "LongArray"
  | "DoubleArray"
  | "BooleanArray"

export type Neo4jType = Neo4jScalarType | Neo4jListType | "Unknown"

export interface ResolvedColumn {
  readonly name: string
  readonly type: Neo4jType
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

// ── Schema lookup ──

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

function lookupPropertyType(
  schema: GraphSchema,
  label: string,
  propertyName: string,
): { type: Neo4jType } | undefined {
  const prop = schema.nodeProperties.find(
    (p) => p.labels.includes(label) && p.propertyName === propertyName,
  )
  if (!prop) return undefined
  const rawType = prop.propertyTypes[0]
  if (!rawType) return undefined
  return { type: normalizeNeo4jType(rawType) }
}

// ── Known function return types ──

const AGGREGATE_RETURN_TYPES: Record<string, Neo4jType> = {
  count: "Long",
  sum: "Long",
  avg: "Double",
  min: "Long",
  max: "Long",
  size: "Long",
}

function collectReturnType(innerType: Neo4jType | undefined): Neo4jType {
  if (innerType === "String") return "StringArray"
  if (innerType === "Long") return "LongArray"
  if (innerType === "Double") return "DoubleArray"
  if (innerType === "Boolean") return "BooleanArray"
  return "StringArray"
}

// ── Types for intermediate state ──

interface Binding { label: string; optional: boolean }
interface ParamUsage { paramName: string; label?: string; property?: string }

// ── Resolve expression type from a projection expression text ──

function resolveExprType(
  exprText: string,
  schema: GraphSchema,
  bindings: Map<string, Binding>,
  withTypes: Map<string, { type: Neo4jType; nullable: boolean }>,
): { type: Neo4jType; nullable: boolean } | undefined {
  // Function invocation: count(*), collect(c.name), coalesce(c.prop, default)
  const funcMatch = exprText.match(/^(\w+)\((.+)\)$/i)
  if (funcMatch) {
    const funcName = funcMatch[1].toLowerCase()
    const argText = funcMatch[2]

    // coalesce(var.prop, default) — extract the first arg's property type
    if (funcName === "coalesce") {
      const args = argText.split(",")
      const firstArg = args[0].trim()
      const propMatch = firstArg.match(/^(\w+)\.(\w+)$/)
      if (propMatch) {
        const binding = bindings.get(propMatch[1])
        if (binding) {
          const lookup = lookupPropertyType(schema, binding.label, propMatch[2])
          if (lookup) return { type: lookup.type, nullable: false }
        }
      }
      return { type: "String", nullable: false }
    }

    // collect(var.prop) — returns array of the property type
    if (funcName === "collect") {
      const propMatch = argText.match(/^(\w+)\.(\w+)$/)
      if (propMatch) {
        const binding = bindings.get(propMatch[1])
        if (binding) {
          const lookup = lookupPropertyType(schema, binding.label, propMatch[2])
          if (lookup) return { type: collectReturnType(lookup.type), nullable: false }
        }
      }
      // collect({...}) or collect(CASE WHEN ...) — unresolvable complex expression
      return { type: "Unknown", nullable: false }
    }

    // type(r) — returns the relationship type name as String
    if (funcName === "type") {
      return { type: "String", nullable: false }
    }

    const aggType = AGGREGATE_RETURN_TYPES[funcName]
    if (aggType) return { type: aggType, nullable: false }
    return { type: "Unknown", nullable: false }
  }

  // Property expression: var.prop
  const propMatch = exprText.match(/^(\w+)\.(\w+)$/)
  if (propMatch) {
    const binding = bindings.get(propMatch[1])
    if (binding) {
      const lookup = lookupPropertyType(schema, binding.label, propMatch[2])
      if (lookup) return { type: lookup.type, nullable: binding.optional }
    }
    return { type: "String", nullable: true }
  }

  // Bare variable — check WITH-computed types, then fall back to Unknown
  const withType = withTypes.get(exprText)
  if (withType) return withType

  return undefined
}

// ── Extract projections from a projection body (shared between WITH and RETURN) ──

interface ProjectionEntry {
  alias: string
  exprText: string
}

function extractProjectionEntries(projBody: { projectionItems(): { projectionItem(): any[] } | null } | null): ProjectionEntry[] {
  const items = projBody?.projectionItems()?.projectionItem() ?? []
  return items.map((item: any) => {
    const aliasCtx = item.symbol()
    const exprText = item.expression()?.getText() ?? ""
    const alias = aliasCtx ? aliasCtx.getText() : exprText
    return { alias, exprText }
  })
}

// ── Public API ──

export const analyzeQuery = (cypher: string, schema: GraphSchema): QueryAnalysis => {
  const tree = parse(cypher)

  const bindings = new Map<string, Binding>()
  const withTypes = new Map<string, { type: Neo4jType; nullable: boolean }>()
  const returnEntries: ProjectionEntry[] = []
  const paramUsages: ParamUsage[] = []
  let inOptionalMatch = false

  const listener = new CypherParserListener()

  listener.enterMatchSt = (ctx: MatchStContext) => {
    inOptionalMatch = ctx.OPTIONAL() !== null
  }

  listener.exitMatchSt = () => {
    inOptionalMatch = false
  }

  listener.enterNodePattern = (ctx: NodePatternContext) => {
    const symbolCtx = ctx.symbol()
    const labelsCtx = ctx.nodeLabels()
    if (!symbolCtx || !labelsCtx) return

    const varName = symbolCtx.getText()
    const labelText = labelsCtx.getText().replace(/^:/, "")

    bindings.set(varName, { label: labelText, optional: inOptionalMatch })

    // Extract param usages from property constraints: (c:Class {fqcn: $fqcn})
    const propsCtx = ctx.properties()
    if (propsCtx) {
      const text = propsCtx.getText()
      const paramRe = /(\w+):\$(\w+)/g
      for (const match of text.matchAll(paramRe)) {
        paramUsages.push({ paramName: match[2], label: labelText, property: match[1] })
      }
    }
  }

  // Track WITH-computed variable types
  listener.enterWithSt = (ctx: WithStContext) => {
    const entries = extractProjectionEntries(ctx.projectionBody())
    for (const { alias, exprText } of entries) {
      const resolved = resolveExprType(exprText, schema, bindings, withTypes)
      if (resolved) {
        withTypes.set(alias, resolved)
      }
    }
  }

  listener.enterReturnSt = (ctx: ReturnStContext) => {
    returnEntries.push(...extractProjectionEntries(ctx.projectionBody()))
  }

  ParseTreeWalker.DEFAULT.walk(listener, tree)

  // Resolve columns
  const columns: ResolvedColumn[] = returnEntries.map((entry) => {
    const resolved = resolveExprType(entry.exprText, schema, bindings, withTypes)
    if (resolved) return { name: entry.alias, ...resolved }
    // Bare variable with no WITH type — unknown
    return { name: entry.alias, type: "Unknown" as Neo4jType, nullable: true }
  })

  // Resolve params
  const params: ResolvedParam[] = paramUsages.map((usage) => {
    if (usage.label && usage.property) {
      const lookup = lookupPropertyType(schema, usage.label, usage.property)
      if (lookup) return { name: usage.paramName, type: lookup.type }
    }
    return { name: usage.paramName, type: "String" as Neo4jType }
  })

  return { columns, params }
}
