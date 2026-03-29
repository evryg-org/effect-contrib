import type { ResolvedColumn, ResolvedParam, Neo4jType } from "./QueryAnalyzer"
import type { QueryEntry } from "./CypherDeclarationGen"

const PARAM_RE = /\$([a-zA-Z_]\w*)/g

export const extractParams = (cypher: string): ReadonlyArray<string> => {
  const params = new Set<string>()
  for (const match of cypher.matchAll(PARAM_RE)) {
    params.add(match[1])
  }
  return [...params]
}

// ── Neo4j type → Effect Schema mapping ──

const TEMPORAL_TYPES = new Set(["Date", "DateTime", "LocalDateTime", "LocalTime", "Time", "Duration"])

function schemaFieldFor(col: ResolvedColumn): string {
  let schema: string
  switch (col.type) {
    case "String": schema = "Schema.String"; break
    case "Long": schema = "Neo4jInt"; break
    case "Double": schema = "Schema.Number"; break
    case "Boolean": schema = "Schema.Boolean"; break
    case "StringArray": schema = "Schema.Array(Schema.String)"; break
    case "LongArray": schema = "Schema.Array(Neo4jInt)"; break
    case "DoubleArray": schema = "Schema.Array(Schema.Number)"; break
    case "BooleanArray": schema = "Schema.Array(Schema.Boolean)"; break
    case "Unknown": schema = "Neo4jValue"; break
    default:
      if (TEMPORAL_TYPES.has(col.type)) {
        schema = "TemporalString"
        break
      }
      schema = "Schema.String"
  }
  return col.nullable ? `Schema.NullOr(${schema})` : schema
}

function needsNeo4jInt(columns: ReadonlyArray<ResolvedColumn>): boolean {
  return columns.some((c) => c.type === "Long" || c.type === "LongArray")
}

function needsNeo4jValue(columns: ReadonlyArray<ResolvedColumn>): boolean {
  return columns.some((c) => c.type === "Unknown")
}

function needsTemporalString(columns: ReadonlyArray<ResolvedColumn>): boolean {
  return columns.some((c) => TEMPORAL_TYPES.has(c.type))
}

function tsTypeFor(type: Neo4jType): string {
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

// ── Module generation ──

export function generateModule(cypher: string, columns?: ReadonlyArray<ResolvedColumn>): string {
  if (!columns || columns.length === 0) {
    return generateUntypedModule(cypher)
  }
  return generateTypedModule(cypher, columns)
}

function generateUntypedModule(cypher: string): string {
  const params = extractParams(cypher)
  const lines = [
    `import { Effect } from "effect";`,
    `import { Neo4jClient } from "@/lib/effect-neo4j";`,
    ``,
    `const cypher = ${JSON.stringify(cypher)};`,
    ``,
  ]

  if (params.length === 0) {
    lines.push(`export const query = () =>`)
    lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(cypher));`)
  } else {
    const destructure = `{ ${params.join(", ")} }`
    lines.push(`export const query = (${destructure}) =>`)
    lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(cypher, ${destructure}));`)
  }

  return lines.join("\n") + "\n"
}

function neo4jSchemaImports(columns: ReadonlyArray<ResolvedColumn>): string[] {
  const imports: string[] = []
  if (needsNeo4jInt(columns)) imports.push("Neo4jInt")
  if (needsNeo4jValue(columns)) imports.push("Neo4jValue")
  return imports
}

function generateTypedModule(cypher: string, columns: ReadonlyArray<ResolvedColumn>): string {
  const params = extractParams(cypher)
  const lines: string[] = []

  // Imports
  lines.push(`import { Effect, Schema } from "effect";`)
  const neo4jImports = neo4jSchemaImports(columns)
  if (neo4jImports.length > 0) {
    lines.push(`import { Neo4jClient, ${neo4jImports.join(", ")} } from "@/lib/effect-neo4j";`)
  } else {
    lines.push(`import { Neo4jClient } from "@/lib/effect-neo4j";`)
  }
  lines.push(``)

  // Cypher constant
  lines.push(`const cypher = ${JSON.stringify(cypher)};`)
  lines.push(``)

  // Temporal string transform (only if needed)
  if (needsTemporalString(columns)) {
    lines.push(`const TemporalString = Schema.transform(`)
    lines.push(`  Schema.Unknown, Schema.String,`)
    lines.push(`  { decode: (v) => (v).toString(), encode: (s) => s },`)
    lines.push(`);`)
    lines.push(``)
  }

  // Row Schema.Struct
  lines.push(`const Row = Schema.Struct({`)
  for (const col of columns) {
    lines.push(`  ${col.name}: ${schemaFieldFor(col)},`)
  }
  lines.push(`});`)
  lines.push(``)

  // Decoder
  lines.push(`const decodeRow = Schema.decodeUnknownSync(Row);`)
  lines.push(``)

  // recordToRow
  lines.push(`const recordToRow = (rec) => decodeRow({`)
  for (const col of columns) {
    lines.push(`  ${col.name}: rec.get("${col.name}"),`)
  }
  lines.push(`});`)
  lines.push(``)

  // Query export
  if (params.length === 0) {
    lines.push(`export const query = () =>`)
  } else {
    const destructure = `{ ${params.join(", ")} }`
    lines.push(`export const query = (${destructure}) =>`)
  }
  lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) =>`)

  if (params.length === 0) {
    lines.push(`    Effect.map(neo4j.query(cypher), (recs) => recs.map(recordToRow)));`)
  } else {
    const destructure = `{ ${params.join(", ")} }`
    lines.push(`    Effect.map(neo4j.query(cypher, ${destructure}), (recs) => recs.map(recordToRow)));`)
  }
  lines.push(``)

  return lines.join("\n")
}

// ── Barrel generation (all queries in one file) ──

function toCamelCase(filename: string): string {
  const base = filename.replace(/\.cypher$/, "")
  return base.charAt(0).toLowerCase() + base.slice(1) + "Query"
}

export interface BarrelEntry {
  readonly filename: string
  readonly cypher: string
  readonly columns: ReadonlyArray<ResolvedColumn>
  readonly params: ReadonlyArray<ResolvedParam>
}

export function generateBarrel(entries: ReadonlyArray<BarrelEntry>): string {
  const lines: string[] = []

  lines.push(`// Auto-generated by cypher-codegen — do not edit`)
  lines.push(`import { Effect, Schema } from "effect"`)

  // Collect all neo4j schema imports needed across all entries
  const allColumns = entries.flatMap((e) => e.columns)
  const neo4jImports = neo4jSchemaImports(allColumns)
  if (neo4jImports.length > 0) {
    lines.push(`import { Neo4jClient, ${neo4jImports.join(", ")} } from "@/lib/effect-neo4j"`)
  } else {
    lines.push(`import { Neo4jClient } from "@/lib/effect-neo4j"`)
  }
  lines.push(``)

  // Shared transforms (emit once if any entry needs them)
  const anyNeedTemporal = entries.some((e) => needsTemporalString(e.columns))

  if (anyNeedTemporal) {
    lines.push(`const TemporalString = Schema.transform(`)
    lines.push(`  Schema.Unknown, Schema.String,`)
    lines.push(`  { decode: (v: any) => v.toString(), encode: (s: string) => s },`)
    lines.push(`)`)
    lines.push(``)
  }

  // Each query (skip entries with empty/invalid column names)
  for (const entry of entries) {
    const validColumns = entry.columns.filter((c) => c.name.length > 0)
    if (validColumns.length === 0 && entry.columns.length > 0) {
      lines.push(`// ── ${entry.filename} (skipped: no aliased columns) ──`)
      lines.push(``)
      continue
    }
    const name = toCamelCase(entry.filename)
    const hasColumns = entry.columns.length > 0

    lines.push(`// ── ${entry.filename} ──`)
    lines.push(``)
    lines.push(`const ${name}Cypher = ${JSON.stringify(entry.cypher)}`)
    lines.push(``)

    if (hasColumns) {
      lines.push(`const ${name}Row = Schema.Struct({`)
      for (const col of entry.columns) {
        lines.push(`  ${col.name}: ${schemaFieldFor(col)},`)
      }
      lines.push(`})`)
      lines.push(``)
      lines.push(`export type ${name.charAt(0).toUpperCase() + name.slice(1)}Row = typeof ${name}Row.Type`)
      lines.push(``)
      lines.push(`const decode${name.charAt(0).toUpperCase() + name.slice(1)} = Schema.decodeUnknownSync(${name}Row)`)
      lines.push(``)

      const recordToRow = `(rec: any) => decode${name.charAt(0).toUpperCase() + name.slice(1)}({ ${entry.columns.map((c) => `${c.name}: rec.get("${c.name}")`).join(", ")} })`

      if (entry.params.length === 0) {
        lines.push(`export const ${name} = () =>`)
        lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) =>`)
        lines.push(`    Effect.map(neo4j.query(${name}Cypher), (recs) => recs.map(${recordToRow})))`)
      } else {
        const destructure = `{ ${entry.params.map((p) => p.name).join(", ")} }`
        const typeAnnotation = entry.params.map((p) => `${p.name}: ${tsTypeFor(p.type)}`).join("; ")
        lines.push(`export const ${name} = (${destructure}: { ${typeAnnotation} }) =>`)
        lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) =>`)
        lines.push(`    Effect.map(neo4j.query(${name}Cypher, ${destructure}), (recs) => recs.map(${recordToRow})))`)
      }
    } else {
      if (entry.params.length === 0) {
        lines.push(`export const ${name} = () =>`)
        lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(${name}Cypher))`)
      } else {
        const destructure = `{ ${entry.params.map((p) => p.name).join(", ")} }`
        const typeAnnotation = entry.params.map((p) => `${p.name}: ${tsTypeFor(p.type)}`).join("; ")
        lines.push(`export const ${name} = (${destructure}: { ${typeAnnotation} }) =>`)
        lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(${name}Cypher, ${destructure}))`)
      }
    }

    lines.push(``)
  }

  return lines.join("\n")
}
