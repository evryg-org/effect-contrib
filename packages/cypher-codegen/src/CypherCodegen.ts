import type { ResolvedColumn } from "./QueryAnalyzer"
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
    case "Long": schema = "Neo4jInteger"; break
    case "Double": schema = "Schema.Number"; break
    case "Boolean": schema = "Schema.Boolean"; break
    case "StringArray": schema = "Schema.Array(Schema.String)"; break
    case "LongArray": schema = "Schema.Array(Neo4jInteger)"; break
    case "DoubleArray": schema = "Schema.Array(Schema.Number)"; break
    case "BooleanArray": schema = "Schema.Array(Schema.Boolean)"; break
    default:
      if (TEMPORAL_TYPES.has(col.type)) {
        schema = "TemporalString"
        break
      }
      schema = "Schema.String"
  }
  return col.nullable ? `Schema.NullOr(${schema})` : schema
}

function needsNeo4jInteger(columns: ReadonlyArray<ResolvedColumn>): boolean {
  return columns.some((c) => c.type === "Long" || c.type === "LongArray")
}

function needsTemporalString(columns: ReadonlyArray<ResolvedColumn>): boolean {
  return columns.some((c) => TEMPORAL_TYPES.has(c.type))
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

function generateTypedModule(cypher: string, columns: ReadonlyArray<ResolvedColumn>): string {
  const params = extractParams(cypher)
  const lines: string[] = []

  // Imports
  lines.push(`import { Effect, Schema } from "effect";`)
  lines.push(`import { Neo4jClient } from "@/lib/effect-neo4j";`)
  lines.push(``)

  // Cypher constant
  lines.push(`const cypher = ${JSON.stringify(cypher)};`)
  lines.push(``)

  // Neo4jInteger transform (only if needed)
  if (needsNeo4jInteger(columns)) {
    lines.push(`const Neo4jInteger = Schema.transform(`)
    lines.push(`  Schema.Unknown, Schema.Number,`)
    lines.push(`  { decode: (v) => typeof v === "number" ? v : (v).toNumber(), encode: (n) => n },`)
    lines.push(`);`)
    lines.push(``)
  }

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
  readonly params: ReadonlyArray<string>
}

export function generateBarrel(entries: ReadonlyArray<BarrelEntry>): string {
  const lines: string[] = []

  lines.push(`// Auto-generated by cypher-codegen — do not edit`)
  lines.push(`import { Effect, Schema } from "effect"`)
  lines.push(`import { Neo4jClient } from "@/lib/effect-neo4j"`)
  lines.push(``)

  // Shared transforms (emit once if any entry needs them)
  const anyNeedInteger = entries.some((e) => needsNeo4jInteger(e.columns))
  const anyNeedTemporal = entries.some((e) => needsTemporalString(e.columns))

  if (anyNeedInteger) {
    lines.push(`const Neo4jInteger = Schema.transform(`)
    lines.push(`  Schema.Unknown, Schema.Number,`)
    lines.push(`  { decode: (v: any) => typeof v === "number" ? v : v.toNumber(), encode: (n: number) => n },`)
    lines.push(`)`)
    lines.push(``)
  }

  if (anyNeedTemporal) {
    lines.push(`const TemporalString = Schema.transform(`)
    lines.push(`  Schema.Unknown, Schema.String,`)
    lines.push(`  { decode: (v: any) => v.toString(), encode: (s: string) => s },`)
    lines.push(`)`)
    lines.push(``)
  }

  // Each query
  for (const entry of entries) {
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
        const destructure = `{ ${entry.params.join(", ")} }`
        lines.push(`export const ${name} = (${destructure}: { ${entry.params.map((p) => `${p}: unknown`).join("; ")} }) =>`)
        lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) =>`)
        lines.push(`    Effect.map(neo4j.query(${name}Cypher, ${destructure}), (recs) => recs.map(${recordToRow})))`)
      }
    } else {
      if (entry.params.length === 0) {
        lines.push(`export const ${name} = () =>`)
        lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(${name}Cypher))`)
      } else {
        const destructure = `{ ${entry.params.join(", ")} }`
        lines.push(`export const ${name} = (${destructure}: { ${entry.params.map((p) => `${p}: unknown`).join("; ")} }) =>`)
        lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(${name}Cypher, ${destructure}))`)
      }
    }

    lines.push(``)
  }

  return lines.join("\n")
}
