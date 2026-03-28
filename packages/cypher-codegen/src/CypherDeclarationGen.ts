import type { ResolvedColumn, ResolvedParam, Neo4jType } from "./QueryAnalyzer"

export interface QueryEntry {
  readonly filename: string
  readonly columns: ReadonlyArray<ResolvedColumn>
  readonly params: ReadonlyArray<ResolvedParam>
}

// ── Neo4j type → TypeScript type mapping ──

const TEMPORAL_TYPES = new Set<Neo4jType>(["Date", "DateTime", "LocalDateTime", "LocalTime", "Time", "Duration"])

function tsTypeFor(type: Neo4jType): string {
  switch (type) {
    case "String": return "string"
    case "Long": return "number"
    case "Double": return "number"
    case "Boolean": return "boolean"
    case "StringArray": return "readonly string[]"
    case "LongArray": return "readonly number[]"
    case "DoubleArray": return "readonly number[]"
    case "BooleanArray": return "readonly boolean[]"
    case "Point": return "{ srid: number; x: number; y: number; z?: number }"
    default:
      if (TEMPORAL_TYPES.has(type)) return "string"
      return "unknown"
  }
}

function fieldTypeFor(col: ResolvedColumn): string {
  const base = tsTypeFor(col.type)
  return col.nullable ? `${base} | null` : base
}

// ── Declaration generation ──

export const generateDeclarations = (queries: ReadonlyArray<QueryEntry>): string => {
  const lines: string[] = []

  lines.push(`import type { Effect } from "effect"`)
  lines.push(`import type { Neo4jClient, Neo4jQueryError } from "@/lib/effect-neo4j"`)
  lines.push(``)

  for (const entry of queries) {
    lines.push(`declare module "*/${entry.filename}" {`)
    lines.push(`  interface Row {`)
    for (const col of entry.columns) {
      lines.push(`    readonly ${col.name}: ${fieldTypeFor(col)}`)
    }
    lines.push(`  }`)

    // Build function signature
    if (entry.params.length === 0) {
      lines.push(`  export const query: () => Effect.Effect<Row[], Neo4jQueryError, Neo4jClient>`)
    } else {
      const paramFields = entry.params.map((p) => `${p.name}: ${tsTypeFor(p.type)}`).join(", ")
      lines.push(`  export const query: (params: { ${paramFields} }) => Effect.Effect<Row[], Neo4jQueryError, Neo4jClient>`)
    }

    lines.push(`}`)
    lines.push(``)
  }

  return lines.join("\n")
}
