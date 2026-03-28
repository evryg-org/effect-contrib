import { Command, Options } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Layer } from "effect"
import { globSync } from "node:fs"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { basename, dirname } from "node:path"
import { Neo4jClientLive, Neo4jConfig } from "@/lib/effect-neo4j"
import { extractSchema, saveSchema, loadSchema } from "./SchemaExtractor"
import { analyzeQuery } from "./QueryAnalyzer"
import { generateDeclarations, type QueryEntry } from "./CypherDeclarationGen"

// ── Shared options ──

const neo4jUriOption = Options.withDefault(Options.text("neo4j-uri"), process.env.NEO4J_URI ?? "bolt://localhost:7687")
const neo4jUserOption = Options.withDefault(Options.text("neo4j-user"), process.env.NEO4J_USER ?? "neo4j")
const neo4jPasswordOption = Options.withDefault(Options.text("neo4j-password"), process.env.NEO4J_PASSWORD ?? "changeme")
const neo4jDatabaseOption = Options.withDefault(Options.text("neo4j-database"), process.env.NEO4J_DATABASE ?? "neo4j")
const schemaPathOption = Options.withDefault(Options.text("schema-path"), "data/graph-schema.json")
const outputOption = Options.withDefault(Options.text("output"), "src/generated/cypher.d.ts")
const cypherGlobOption = Options.withDefault(Options.text("cypher-glob"), "src/**/*.cypher")

// ── extract-schema command ──

const extractSchemaCommand = Command.make(
  "extract-schema",
  { neo4jUri: neo4jUriOption, neo4jUser: neo4jUserOption, neo4jPassword: neo4jPasswordOption, neo4jDatabase: neo4jDatabaseOption, schemaPath: schemaPathOption },
  ({ neo4jUri, neo4jUser, neo4jPassword, neo4jDatabase, schemaPath }) =>
    Effect.gen(function* () {
      const schema = yield* extractSchema()
      saveSchema(schemaPath, schema)
      yield* Console.log(`Schema extracted and saved to ${schemaPath}`)
      yield* Console.log(`  ${schema.nodeProperties.length} node properties, ${schema.relProperties.length} relationship properties`)
    }).pipe(
      Effect.provide(
        Neo4jClientLive.pipe(
          Layer.provide(
            Layer.succeed(Neo4jConfig, { uri: neo4jUri, user: neo4jUser, password: neo4jPassword, database: neo4jDatabase }),
          ),
        ),
      ),
    ),
)

// ── generate command ──

const generateCommand = Command.make(
  "generate",
  { schemaPath: schemaPathOption, output: outputOption, cypherGlob: cypherGlobOption },
  ({ schemaPath, output, cypherGlob }) =>
    Effect.gen(function* () {
      const schema = loadSchema(schemaPath)
      const files = globSync(cypherGlob)

      // Validate filename uniqueness
      const filenames = files.map((f) => basename(f))
      const duplicates = filenames.filter((name, i) => filenames.indexOf(name) !== i)
      if (duplicates.length > 0) {
        yield* Effect.fail(new Error(`Duplicate .cypher filenames: ${[...new Set(duplicates)].join(", ")}`))
      }

      const entries: QueryEntry[] = files.map((file) => {
        const cypher = readFileSync(file, "utf-8").trim()
        const analysis = analyzeQuery(cypher, schema)
        return {
          filename: basename(file),
          columns: analysis.columns,
          params: analysis.params,
        }
      })

      const content = generateDeclarations(entries)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, content, "utf-8")

      yield* Console.log(`Generated ${output} with ${entries.length} query declarations`)
      for (const entry of entries) {
        yield* Console.log(`  ${entry.filename}: ${entry.columns.length} columns, ${entry.params.length} params`)
      }
    }),
)

// ── all command (default) ──

const allCommand = Command.make(
  "all",
  {
    neo4jUri: neo4jUriOption, neo4jUser: neo4jUserOption, neo4jPassword: neo4jPasswordOption,
    neo4jDatabase: neo4jDatabaseOption, schemaPath: schemaPathOption, output: outputOption, cypherGlob: cypherGlobOption,
  },
  ({ neo4jUri, neo4jUser, neo4jPassword, neo4jDatabase, schemaPath, output, cypherGlob }) =>
    Effect.gen(function* () {
      // Step 1: extract schema
      const schema = yield* extractSchema()
      saveSchema(schemaPath, schema)
      yield* Console.log(`Schema extracted: ${schema.nodeProperties.length} node properties`)

      // Step 2: generate declarations
      const files = globSync(cypherGlob)
      const filenames = files.map((f) => basename(f))
      const duplicates = filenames.filter((name, i) => filenames.indexOf(name) !== i)
      if (duplicates.length > 0) {
        yield* Effect.fail(new Error(`Duplicate .cypher filenames: ${[...new Set(duplicates)].join(", ")}`))
      }

      const entries: QueryEntry[] = files.map((file) => {
        const cypher = readFileSync(file, "utf-8").trim()
        const analysis = analyzeQuery(cypher, schema)
        return { filename: basename(file), columns: analysis.columns, params: analysis.params }
      })

      const content = generateDeclarations(entries)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, content, "utf-8")

      yield* Console.log(`Generated ${output} with ${entries.length} query declarations`)
    }).pipe(
      Effect.provide(
        Neo4jClientLive.pipe(
          Layer.provide(
            Layer.succeed(Neo4jConfig, { uri: neo4jUri, user: neo4jUser, password: neo4jPassword, database: neo4jDatabase }),
          ),
        ),
      ),
    ),
)

// ── Root command ──

const rootCommand = Command.make("cypher-codegen").pipe(
  Command.withSubcommands([extractSchemaCommand, generateCommand, allCommand]),
)

const cli = Command.run(rootCommand, { name: "cypher-codegen", version: "0.1.0" })

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain)
