/** @since 0.0.1 */
import { Neo4jConfig, UnconfiguredNeo4jClient } from "@evryg/effect-neo4j"
import type { GraphSchema } from "@evryg/effect-neo4j-schema"
import { Console, Effect, Layer, Result, Schema } from "effect"
import { Flag } from "effect/unstable/cli"
import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname } from "node:path"
import { type BarrelEntry, extractParams, generateBarrel } from "../../../backend/CypherCodegen.js"
import { analyzeQuery, type ResolvedParam } from "../../../frontend/QueryAnalyzer.js"

// ── Options ──

/**
 * @since 0.0.1
 * @category options
 */
export const neo4jUriOption = Flag.withDefault(
  Flag.string("neo4j-uri"),
  process.env.NEO4J_URI ?? "bolt://localhost:7687"
)
/**
 * @since 0.0.1
 * @category options
 */
export const neo4jUserOption = Flag.withDefault(Flag.string("neo4j-user"), process.env.NEO4J_USER ?? "neo4j")
/**
 * @since 0.0.1
 * @category options
 */
export const neo4jPasswordOption = Flag.withDefault(
  Flag.string("neo4j-password"),
  process.env.NEO4J_PASSWORD ?? "changeme"
)
/**
 * @since 0.0.1
 * @category options
 */
export const neo4jDatabaseOption = Flag.withDefault(
  Flag.string("neo4j-database"),
  process.env.NEO4J_DATABASE ?? "neo4j"
)
/**
 * @since 0.0.1
 * @category options
 */
export const schemaPathOption = Flag.withDefault(Flag.string("schema-path"), "data/graph-schema.json")
/**
 * @since 0.0.1
 * @category options
 */
export const outputOption = Flag.withDefault(Flag.string("output"), "src/generated/queries.ts")
/**
 * @since 0.0.1
 * @category options
 */
export const cypherGlobOption = Flag.withDefault(Flag.string("cypher-glob"), "src/**/*.cypher")

/**
 * @since 0.0.1
 * @category options
 */
export const neo4jOptions = {
  neo4jUri: neo4jUriOption,
  neo4jUser: neo4jUserOption,
  neo4jPassword: neo4jPasswordOption,
  neo4jDatabase: neo4jDatabaseOption
}

// ── Neo4j Layer ──

/**
 * @since 0.0.1
 * @category layers
 */
export function neo4jLayer(
  opts: { neo4jUri: string; neo4jUser: string; neo4jPassword: string; neo4jDatabase: string }
) {
  return UnconfiguredNeo4jClient.pipe(
    Layer.provide(
      Layer.succeed(Neo4jConfig, {
        uri: opts.neo4jUri,
        user: opts.neo4jUser,
        password: opts.neo4jPassword,
        database: opts.neo4jDatabase
      })
    )
  )
}

// ── Errors ──

/**
 * @since 0.1.1
 * @category errors
 */
export class DuplicateCypherFilenamesError extends Schema.TaggedErrorClass<DuplicateCypherFilenamesError>(
  "@evryg/effect-cypher-codegen/DuplicateCypherFilenamesError"
)("DuplicateCypherFilenamesError", {
  filenames: Schema.Array(Schema.String)
}) {
  override get message() {
    return `Duplicate .cypher filenames: ${this.filenames.join(", ")}`
  }
}

/**
 * @since 0.1.1
 * @category errors
 */
export class CypherCodegenError extends Schema.TaggedErrorClass<CypherCodegenError>(
  "@evryg/effect-cypher-codegen/CypherCodegenError"
)("CypherCodegenError", {
  failures: Schema.Array(Schema.Struct({
    filename: Schema.String,
    error: Schema.String
  }))
}) {
  override get message() {
    const details = this.failures.map((f) => `  ✗ ${f.filename}: ${f.error}`).join("\n")
    return `${this.failures.length} Cypher type error(s):\n${details}`
  }
}

// ── Shared codegen logic ──

function mergeParams(analyzerParams: ReadonlyArray<ResolvedParam>, cypher: string): Array<ResolvedParam> {
  const regexNames = extractParams(cypher)
  const byName = new Map(analyzerParams.map((p) => [p.name, p]))
  for (const name of regexNames) {
    if (!byName.has(name)) byName.set(name, { name, type: "String", nullable: false })
  }
  return regexNames.filter((n) => byName.has(n)).map((n) => byName.get(n)!)
}

/**
 * @since 0.0.1
 * @category codegen
 */
export function generateFromSchema(
  schema: GraphSchema,
  output: string,
  cypherGlob: string
) {
  return Effect.gen(function*() {
    const files = globSync(cypherGlob).filter((f) => !basename(f).endsWith("GraphSchema.cypher"))

    const filenames = files.map((f) => basename(f))
    const duplicates = filenames.filter((name, i) => filenames.indexOf(name) !== i)
    if (duplicates.length > 0) {
      return yield* new DuplicateCypherFilenamesError({ filenames: [...new Set(duplicates)] })
    }

    const results = files.map(
      (file): Result.Result<BarrelEntry, { filename: string; error: string }> => {
        try {
          const cypher = readFileSync(file, "utf-8").trim()
          const analysis = analyzeQuery(cypher, schema)
          return Result.succeed(
            {
              filename: basename(file),
              cypher,
              columns: analysis.columns,
              params: mergeParams(analysis.params, cypher)
            } satisfies BarrelEntry
          )
        } catch (e) {
          return Result.fail({ filename: basename(file), error: e instanceof Error ? e.message : String(e) })
        }
      }
    )

    const failures: Array<{ filename: string; error: string }> = []
    const entries: Array<BarrelEntry> = []
    for (const result of results) {
      Result.match(result, {
        onFailure: (f) => failures.push(f),
        onSuccess: (e) => entries.push(e)
      })
    }

    if (failures.length > 0) return yield* new CypherCodegenError({ failures })

    const content = generateBarrel(entries)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, content, "utf-8")

    yield* Console.log(`Generated ${output} with ${entries.length} typed queries`)
    for (const entry of entries) {
      yield* Console.log(`  ${entry.filename}: ${entry.columns.length} columns, ${entry.params.length} params`)
    }
  })
}
