import { CharStream, CommonTokenStream, ParseTreeWalker } from "antlr4ng"
import { CypherLexer } from "./generated-parser/CypherLexer.js"
import { CypherParser, type MatchStContext, type NodePatternContext, type ReturnStContext } from "./generated-parser/CypherParser.js"
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

export type Neo4jType = Neo4jScalarType | Neo4jListType

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
    case "LIST<STRING>": case "LIST<STRING NOT NULL>": return "StringArray"
    case "LIST<LONG>": case "LIST<LONG NOT NULL>": case "LIST<INTEGER>": case "LIST<INTEGER NOT NULL>": return "LongArray"
    case "LIST<FLOAT>": case "LIST<FLOAT NOT NULL>": case "LIST<DOUBLE>": case "LIST<DOUBLE NOT NULL>": return "DoubleArray"
    case "LIST<BOOLEAN>": case "LIST<BOOLEAN NOT NULL>": return "BooleanArray"
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
): { type: Neo4jType; mandatory: boolean } | undefined {
  const prop = schema.nodeProperties.find(
    (p) => p.labels.includes(label) && p.propertyName === propertyName,
  )
  if (!prop) return undefined
  const rawType = prop.propertyTypes[0]
  if (!rawType) return undefined
  return { type: normalizeNeo4jType(rawType), mandatory: prop.mandatory }
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
interface Projection {
  alias: string
  variable?: string
  property?: string
  functionName?: string
  functionArg?: { variable: string; property: string }
}
interface ParamUsage { paramName: string; label?: string; property?: string }

// ── Public API ──

export const analyzeQuery = (cypher: string, schema: GraphSchema): QueryAnalysis => {
  const tree = parse(cypher)

  const bindings = new Map<string, Binding>()
  const projections: Projection[] = []
  const paramUsages: ParamUsage[] = []
  let inOptionalMatch = false

  // Build listener with property assignments (required by antlr4ng generated listeners)
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

  listener.enterReturnSt = (ctx: ReturnStContext) => {
    const items = ctx.projectionBody()?.projectionItems()?.projectionItem() ?? []
    for (const item of items) {
      const aliasCtx = item.symbol()
      const alias = aliasCtx ? aliasCtx.getText() : ""
      const exprText = item.expression()?.getText() ?? ""

      // Function invocation: count(*), collect(c.name)
      const funcMatch = exprText.match(/^(\w+)\((.+)\)$/i)
      if (funcMatch) {
        const funcName = funcMatch[1].toLowerCase()
        const argText = funcMatch[2]
        const propMatch = argText.match(/^(\w+)\.(\w+)$/)
        if (propMatch) {
          projections.push({ alias, functionName: funcName, functionArg: { variable: propMatch[1], property: propMatch[2] } })
        } else {
          projections.push({ alias, functionName: funcName })
        }
        continue
      }

      // Property expression: var.prop
      const propMatch = exprText.match(/^(\w+)\.(\w+)$/)
      if (propMatch) {
        projections.push({ alias, variable: propMatch[1], property: propMatch[2] })
        continue
      }

      projections.push({ alias })
    }
  }

  ParseTreeWalker.DEFAULT.walk(listener, tree)

  // Resolve columns
  const columns: ResolvedColumn[] = projections.map((proj) => {
    if (proj.functionName) {
      if (proj.functionName === "collect" && proj.functionArg) {
        const binding = bindings.get(proj.functionArg.variable)
        if (binding) {
          const lookup = lookupPropertyType(schema, binding.label, proj.functionArg.property)
          if (lookup) return { name: proj.alias, type: collectReturnType(lookup.type), nullable: false }
        }
        return { name: proj.alias, type: "StringArray" as Neo4jType, nullable: false }
      }
      const aggType = AGGREGATE_RETURN_TYPES[proj.functionName]
      if (aggType) return { name: proj.alias, type: aggType, nullable: false }
      return { name: proj.alias, type: "String" as Neo4jType, nullable: false }
    }

    if (proj.variable && proj.property) {
      const binding = bindings.get(proj.variable)
      if (binding) {
        const lookup = lookupPropertyType(schema, binding.label, proj.property)
        if (lookup) {
          const nullable = binding.optional || !lookup.mandatory
          return { name: proj.alias, type: lookup.type, nullable }
        }
      }
      return { name: proj.alias, type: "String" as Neo4jType, nullable: true }
    }

    return { name: proj.alias, type: "String" as Neo4jType, nullable: true }
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
