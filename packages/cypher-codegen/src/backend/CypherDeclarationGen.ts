import type { ResolvedColumn, ResolvedParam, Neo4jType } from "../frontend/QueryAnalyzer.js"
import type { CypherType } from "../types/CypherType.js"

export interface QueryEntry {
  readonly filename: string
  readonly columns: ReadonlyArray<ResolvedColumn>
  readonly params: ReadonlyArray<ResolvedParam>
}

// ── CypherType → TypeScript type string ──

const TEMPORAL_SCALAR_TYPES = new Set(["Date", "DateTime", "LocalDateTime", "LocalTime", "Time", "Duration"])

function cypherTypeToTs(ct: CypherType): string {
  switch (ct._tag) {
    case "ScalarType":
      switch (ct.scalarType) {
        case "String": return "string"
        case "Long": case "Double": return "number"
        case "Boolean": return "boolean"
        case "Point": return "{ srid: number; x: number; y: number; z?: number }"
        default:
          if (TEMPORAL_SCALAR_TYPES.has(ct.scalarType)) return "string"
          return "unknown"
      }
    case "ListType":
      return `readonly ${cypherTypeToTs(ct.element)}[]`
    case "MapType":
      if (ct.fields.length === 0) return "unknown"
      const fields = ct.fields.map((f) => `readonly ${f.name}: ${cypherTypeToTs(f.value)}`).join("; ")
      return `{ ${fields} }`
    case "NullableType":
      return `${cypherTypeToTs(ct.inner)} | null`
    case "NeverType":
      return "never"
    case "UnknownType":
    case "VertexType":
    case "VertexUnionType":
    case "EdgeType":
      return "unknown"
  }
}

function tsTypeForParam(type: Neo4jType): string {
  switch (type) {
    case "String": return "string"
    case "Long": case "Double": return "number"
    case "Boolean": return "boolean"
    case "StringArray": return "readonly string[]"
    case "LongArray": case "DoubleArray": return "readonly number[]"
    case "BooleanArray": return "readonly boolean[]"
    default: return "unknown"
  }
}

function fieldTypeFor(col: ResolvedColumn): string {
  const base = cypherTypeToTs(col.type)
  return col.nullable ? `${base} | null` : base
}

// ── Per-file declaration generation (.d.cypher.ts) ──

export const generateDeclaration = (entry: QueryEntry): string => {
  const lines: string[] = []

  lines.push(`import type { Effect } from "effect"`)
  lines.push(`import type { Neo4jClient, Neo4jQueryError } from "@evryg/effect-neo4j"`)
  lines.push(``)

  // Row interface
  lines.push(`interface Row {`)
  for (const col of entry.columns) {
    lines.push(`  readonly ${col.name}: ${fieldTypeFor(col)}`)
  }
  lines.push(`}`)
  lines.push(``)

  // Query function signature
  if (entry.params.length === 0) {
    lines.push(`export declare const query: () => Effect.Effect<Row[], Neo4jQueryError, Neo4jClient>`)
  } else {
    const paramFields = entry.params.map((p) => `${p.name}: ${tsTypeForParam(p.type)}`).join(", ")
    lines.push(`export declare const query: (params: { ${paramFields} }) => Effect.Effect<Row[], Neo4jQueryError, Neo4jClient>`)
  }
  lines.push(``)

  return lines.join("\n")
}

// ── Bulk generation (all entries into single file with declare module) ──

export const generateDeclarations = (queries: ReadonlyArray<QueryEntry>): string => {
  const lines: string[] = []

  lines.push(`import type { Effect } from "effect"`)
  lines.push(`import type { Neo4jClient, Neo4jQueryError } from "@evryg/effect-neo4j"`)
  lines.push(``)

  for (const entry of queries) {
    lines.push(`declare module "*/${entry.filename}" {`)
    lines.push(`  interface Row {`)
    for (const col of entry.columns) {
      lines.push(`    readonly ${col.name}: ${fieldTypeFor(col)}`)
    }
    lines.push(`  }`)

    if (entry.params.length === 0) {
      lines.push(`  export const query: () => Effect.Effect<Row[], Neo4jQueryError, Neo4jClient>`)
    } else {
      const paramFields = entry.params.map((p) => `${p.name}: ${tsTypeForParam(p.type)}`).join(", ")
      lines.push(`  export const query: (params: { ${paramFields} }) => Effect.Effect<Row[], Neo4jQueryError, Neo4jClient>`)
    }

    lines.push(`}`)
    lines.push(``)
  }

  return lines.join("\n")
}
