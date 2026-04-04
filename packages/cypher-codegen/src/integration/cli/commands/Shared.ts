import { Options } from "@effect/cli"
import { Console, Effect, Either, Layer } from "effect"
import { globSync } from "node:fs"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { basename, dirname } from "node:path"
import { UnconfiguredNeo4jClient, Neo4jConfig } from "@/lib/effect-neo4j"
import type { GraphSchema } from "@/lib/effect-neo4j-schema/GraphSchemaModel"
import { analyzeQuery, type ResolvedParam } from "../../../frontend/QueryAnalyzer"
import { generateBarrel, extractParams, type BarrelEntry } from "../../../backend/CypherCodegen"

// ── Options ──

export const neo4jUriOption = Options.withDefault(Options.text("neo4j-uri"), process.env.NEO4J_URI ?? "bolt://localhost:7687")
export const neo4jUserOption = Options.withDefault(Options.text("neo4j-user"), process.env.NEO4J_USER ?? "neo4j")
export const neo4jPasswordOption = Options.withDefault(Options.text("neo4j-password"), process.env.NEO4J_PASSWORD ?? "changeme")
export const neo4jDatabaseOption = Options.withDefault(Options.text("neo4j-database"), process.env.NEO4J_DATABASE ?? "neo4j")
export const schemaPathOption = Options.withDefault(Options.text("schema-path"), "data/graph-schema.json")
export const outputOption = Options.withDefault(Options.text("output"), "src/generated/queries.ts")
export const cypherGlobOption = Options.withDefault(Options.text("cypher-glob"), "src/**/*.cypher")

export const neo4jOptions = {
  neo4jUri: neo4jUriOption,
  neo4jUser: neo4jUserOption,
  neo4jPassword: neo4jPasswordOption,
  neo4jDatabase: neo4jDatabaseOption,
}

// ── Neo4j Layer ──

export function neo4jLayer(opts: { neo4jUri: string; neo4jUser: string; neo4jPassword: string; neo4jDatabase: string }) {
  return UnconfiguredNeo4jClient.pipe(
    Layer.provide(
      Layer.succeed(Neo4jConfig, { uri: opts.neo4jUri, user: opts.neo4jUser, password: opts.neo4jPassword, database: opts.neo4jDatabase }),
    ),
  )
}

// ── Shared codegen logic ──

function mergeParams(analyzerParams: ReadonlyArray<ResolvedParam>, cypher: string): ResolvedParam[] {
  const regexNames = extractParams(cypher)
  const byName = new Map(analyzerParams.map((p) => [p.name, p]))
  for (const name of regexNames) {
    if (!byName.has(name)) byName.set(name, { name, type: "String" })
  }
  return regexNames.filter((n) => byName.has(n)).map((n) => byName.get(n)!)
}

export function generateFromSchema(schema: GraphSchema, output: string, cypherGlob: string) {
  return Effect.gen(function* () {
    const files = globSync(cypherGlob).filter((f) => !basename(f).endsWith("GraphSchema.cypher"))

    const filenames = files.map((f) => basename(f))
    const duplicates = filenames.filter((name, i) => filenames.indexOf(name) !== i)
    if (duplicates.length > 0) {
      yield* Effect.fail(new Error(`Duplicate .cypher filenames: ${[...new Set(duplicates)].join(", ")}`))
    }

    const eithers = files.map((file) =>
      Either.try({
        try: () => {
          const cypher = readFileSync(file, "utf-8").trim()
          const analysis = analyzeQuery(cypher, schema)
          return {
            filename: basename(file),
            cypher,
            columns: analysis.columns,
            params: mergeParams(analysis.params, cypher),
          } satisfies BarrelEntry
        },
        catch: (e) => ({ filename: basename(file), error: e instanceof Error ? e.message : String(e) }),
      }),
    )

    const failures: Array<{ filename: string; error: string }> = []
    const entries: BarrelEntry[] = []
    for (const either of eithers) {
      Either.match(either, {
        onLeft: (f) => failures.push(f),
        onRight: (e) => entries.push(e),
      })
    }

    if (failures.length > 0) {
      for (const f of failures) {
        yield* Console.error(`✗ ${f.filename}: ${f.error}`)
      }
      yield* Effect.fail(new Error(`${failures.length} Cypher type error(s)`))
    }

    const content = generateBarrel(entries)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, content, "utf-8")

    yield* Console.log(`Generated ${output} with ${entries.length} typed queries`)
    for (const entry of entries) {
      yield* Console.log(`  ${entry.filename}: ${entry.columns.length} columns, ${entry.params.length} params`)
    }
  })
}
