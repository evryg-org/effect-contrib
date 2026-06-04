/** @since 0.0.1 */
import type { Neo4jType, ResolvedColumn, ResolvedParam } from "../frontend/QueryAnalyzer.js"
import type { CypherType } from "../types/CypherType.js"

const PARAM_RE = /\$([a-zA-Z_]\w*)/g

/**
 * @since 0.0.1
 * @category codegen
 */
export const extractParams = (cypher: string): ReadonlyArray<string> => {
  const params = new Set<string>()
  for (const match of cypher.matchAll(PARAM_RE)) {
    params.add(match[1])
  }
  return [...params]
}

// ── CypherType → Effect Schema string (recursive) ──

const TEMPORAL_SCALAR_TYPES = new Set(["Date", "DateTime", "LocalDateTime", "LocalTime", "Time", "Duration"])

function cypherTypeToSchema(ct: CypherType): string {
  switch (ct._tag) {
    case "ScalarType":
      switch (ct.scalarType) {
        case "Long":
          return "Neo4jInt"
        case "Double":
          return "Schema.Number"
        case "String":
          return "Schema.String"
        case "Boolean":
          return "Schema.Boolean"
        default:
          if (TEMPORAL_SCALAR_TYPES.has(ct.scalarType)) return "TemporalString"
          return "Neo4jValue"
      }
    case "ListType":
      return `Schema.Array(${cypherTypeToSchema(ct.element)})`
    case "MapType": {
      if (ct.fields.length === 0) return "Neo4jValue"
      const fields = ct.fields
        .map((f) => `${f.name}: ${cypherTypeToSchema(f.value)}`)
        .join(", ")
      return `Schema.Struct({ ${fields} })`
    }
    case "NullableType":
      return `Schema.NullOr(${cypherTypeToSchema(ct.inner)})`
    case "NeverType":
      return "Schema.Never"
    case "UnknownType":
      return "Neo4jValue"
    case "VertexType":
    case "VertexUnionType":
    case "EdgeType":
      return "Neo4jValue"
  }
}

function columnToSchema(col: ResolvedColumn): string {
  const base = cypherTypeToSchema(col.type)
  return col.nullable ? `Schema.NullOr(${base})` : base
}

// ── Import detection (recursive walk of CypherType) ──

function collectNeo4jImports(ct: CypherType, imports: Set<string>): void {
  switch (ct._tag) {
    case "ScalarType":
      if (ct.scalarType === "Long") imports.add("Neo4jInt")
      else if (
        ct.scalarType !== "Double" && ct.scalarType !== "String" && ct.scalarType !== "Boolean" &&
        !TEMPORAL_SCALAR_TYPES.has(ct.scalarType)
      ) imports.add("Neo4jValue")
      break
    case "ListType":
      collectNeo4jImports(ct.element, imports)
      break
    case "MapType":
      if (ct.fields.length === 0) imports.add("Neo4jValue")
      else for (const f of ct.fields) collectNeo4jImports(f.value, imports)
      break
    case "NullableType":
      collectNeo4jImports(ct.inner, imports)
      break
    case "NeverType":
      break
    case "UnknownType":
      imports.add("Neo4jValue")
      break
    case "VertexType":
    case "VertexUnionType":
    case "EdgeType":
      imports.add("Neo4jValue")
      break
  }
}

function neo4jSchemaImports(columns: ReadonlyArray<ResolvedColumn>): Array<string> {
  const imports = new Set<string>()
  for (const col of columns) collectNeo4jImports(col.type, imports)
  return [...imports].sort()
}

function needsTemporalString(columns: ReadonlyArray<ResolvedColumn>): boolean {
  function hasTemporalScalar(ct: CypherType): boolean {
    switch (ct._tag) {
      case "ScalarType":
        return TEMPORAL_SCALAR_TYPES.has(ct.scalarType)
      case "ListType":
        return hasTemporalScalar(ct.element)
      case "MapType":
        return ct.fields.some((f) => hasTemporalScalar(f.value))
      case "NullableType":
        return hasTemporalScalar(ct.inner)
      default:
        return false
    }
  }
  return columns.some((c) => hasTemporalScalar(c.type))
}

function tsTypeFor(type: Neo4jType): string {
  switch (type) {
    case "String":
      return "string"
    case "Long":
    case "Double":
      return "number"
    case "Boolean":
      return "boolean"
    case "StringArray":
      return "readonly string[]"
    case "LongArray":
    case "DoubleArray":
      return "readonly number[]"
    case "BooleanArray":
      return "readonly boolean[]"
    default:
      return "unknown"
  }
}

// ── Parameter signatures ──

/**
 * The parameter signature for a generated query function: the declaration
 * (typed when param types are known, so the generated code never relies on an
 * implicit `any`) and the call-site destructure. `undefined` when the query
 * takes no parameters.
 */
function queryParams(
  cypher: string,
  params?: ReadonlyArray<ResolvedParam>
): { readonly decl: string; readonly call: string } | undefined {
  if (params && params.length > 0) {
    const call = `{ ${params.map((p) => p.name).join(", ")} }`
    const annotation = params
      .map((p) => `${p.name}: ${tsTypeFor(p.type)}${p.nullable ? " | null" : ""}`)
      .join("; ")
    return { decl: `${call}: { ${annotation} }`, call }
  }
  const names = extractParams(cypher)
  if (names.length === 0) return undefined
  const destructure = `{ ${names.join(", ")} }`
  return { decl: destructure, call: destructure }
}

// ── Module generation ──

/**
 * @since 0.0.1
 * @category codegen
 */
export function generateModule(
  cypher: string,
  columns?: ReadonlyArray<ResolvedColumn>,
  params?: ReadonlyArray<ResolvedParam>
): string {
  if (!columns || columns.length === 0) {
    return generateUntypedModule(cypher, params)
  }
  return generateTypedModule(cypher, columns, params)
}

function generateUntypedModule(cypher: string, params?: ReadonlyArray<ResolvedParam>): string {
  const sig = queryParams(cypher, params)
  const lines = [
    `import { Effect } from "effect";`,
    `import { Neo4jClient } from "@evryg/effect-neo4j";`,
    ``,
    `const cypher = ${JSON.stringify(cypher)};`,
    ``
  ]

  if (sig === undefined) {
    lines.push(`export const query = () =>`)
    lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(cypher));`)
  } else {
    lines.push(`export const query = (${sig.decl}) =>`)
    lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(cypher, ${sig.call}));`)
  }

  return lines.join("\n") + "\n"
}

function generateTypedModule(
  cypher: string,
  columns: ReadonlyArray<ResolvedColumn>,
  params?: ReadonlyArray<ResolvedParam>
): string {
  // UnknownType columns emit Neo4jValue (escape hatch for unlabeled nodes)
  const sig = queryParams(cypher, params)
  const lines: Array<string> = []

  // Imports
  lines.push(
    `import { Effect, Schema${needsTemporalString(columns) ? ", SchemaTransformation" : ""} } from "effect";`
  )
  const neo4jImports = neo4jSchemaImports(columns)
  if (neo4jImports.length > 0) {
    lines.push(`import { Neo4jClient, ${neo4jImports.join(", ")} } from "@evryg/effect-neo4j";`)
  } else {
    lines.push(`import { Neo4jClient } from "@evryg/effect-neo4j";`)
  }
  lines.push(``)

  // Cypher constant
  lines.push(`const cypher = ${JSON.stringify(cypher)};`)
  lines.push(``)

  // Temporal string transform (only if needed)
  if (needsTemporalString(columns)) {
    lines.push(`const TemporalString = Schema.Unknown.pipe(Schema.decodeTo(`)
    lines.push(`  Schema.String,`)
    lines.push(
      `  SchemaTransformation.transform<string, unknown>({ decode: (v) => (v as { toString(): string }).toString(), encode: (s) => s }),`
    )
    lines.push(`));`)
    lines.push(``)
  }

  // Row Schema.Struct
  lines.push(`const Row = Schema.Struct({`)
  for (const col of columns) {
    lines.push(`  ${col.name}: ${columnToSchema(col)},`)
  }
  lines.push(`});`)
  lines.push(``)

  // Decoder: validate each row's plain object against the struct
  lines.push(`const decodeRows = Schema.decodeUnknownSync(Schema.Array(Row));`)
  lines.push(``)

  // Query export
  lines.push(`export const query = (${sig?.decl ?? ""}) =>`)
  lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) =>`)

  if (sig === undefined) {
    lines.push(`    Effect.map(neo4j.query(cypher), (records) => decodeRows(records.map((r) => r.toObject()))));`)
  } else {
    lines.push(
      `    Effect.map(neo4j.query(cypher, ${sig.call}), (records) => decodeRows(records.map((r) => r.toObject()))));`
    )
  }
  lines.push(``)

  return lines.join("\n")
}

// ── Barrel generation (all queries in one file) ──

function toCamelCase(filename: string): string {
  const base = filename.replace(/\.cypher$/, "")
  return base.charAt(0).toLowerCase() + base.slice(1) + "Query"
}

/**
 * @since 0.0.1
 * @category codegen
 */
export interface BarrelEntry {
  readonly filename: string
  readonly cypher: string
  readonly columns: ReadonlyArray<ResolvedColumn>
  readonly params: ReadonlyArray<ResolvedParam>
}

/**
 * @since 0.0.1
 * @category codegen
 */
export function generateBarrel(entries: ReadonlyArray<BarrelEntry>): string {
  const lines: Array<string> = []

  const anyNeedTemporal = entries.some((e) => needsTemporalString(e.columns))

  lines.push(`// Auto-generated by cypher-codegen — do not edit`)
  lines.push(`import { Effect, Schema${anyNeedTemporal ? ", SchemaTransformation" : ""} } from "effect"`)

  // Collect all neo4j schema imports needed across all entries
  const allColumns = entries.flatMap((e) => e.columns)
  const neo4jImports = neo4jSchemaImports(allColumns)
  if (neo4jImports.length > 0) {
    lines.push(`import { Neo4jClient, ${neo4jImports.join(", ")} } from "@evryg/effect-neo4j"`)
  } else {
    lines.push(`import { Neo4jClient } from "@evryg/effect-neo4j"`)
  }
  lines.push(``)

  // Shared temporal transform (emit once, only if needed)
  if (anyNeedTemporal) {
    lines.push(`const TemporalString = Schema.Unknown.pipe(Schema.decodeTo(`)
    lines.push(`  Schema.String,`)
    lines.push(
      `  SchemaTransformation.transform<string, unknown>({ decode: (v) => (v as { toString(): string }).toString(), encode: (s) => s }),`
    )
    lines.push(`))`)
    lines.push(``)
  }

  // Each query
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

    const sig = queryParams(entry.cypher, entry.params)

    if (hasColumns) {
      const decodeName = `decode${name.charAt(0).toUpperCase() + name.slice(1)}`

      lines.push(`const ${name}Row = Schema.Struct({`)
      for (const col of entry.columns) {
        lines.push(`  ${col.name}: ${columnToSchema(col)},`)
      }
      lines.push(`})`)
      lines.push(``)
      lines.push(`export type ${name.charAt(0).toUpperCase() + name.slice(1)}Row = typeof ${name}Row.Type`)
      lines.push(``)
      lines.push(`const ${decodeName} = Schema.decodeUnknownSync(Schema.Array(${name}Row))`)
      lines.push(``)

      lines.push(`export const ${name} = (${sig?.decl ?? ""}) =>`)
      lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) =>`)
      if (sig === undefined) {
        lines.push(
          `    Effect.map(neo4j.query(${name}Cypher), (records) => ${decodeName}(records.map((r) => r.toObject()))))`
        )
      } else {
        lines.push(
          `    Effect.map(neo4j.query(${name}Cypher, ${sig.call}), (records) => ${decodeName}(records.map((r) => r.toObject()))))`
        )
      }
    } else {
      lines.push(`export const ${name} = (${sig?.decl ?? ""}) =>`)
      if (sig === undefined) {
        lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(${name}Cypher))`)
      } else {
        lines.push(`  Effect.flatMap(Neo4jClient, (neo4j) => neo4j.query(${name}Cypher, ${sig.call}))`)
      }
    }

    lines.push(``)
  }

  return lines.join("\n")
}
