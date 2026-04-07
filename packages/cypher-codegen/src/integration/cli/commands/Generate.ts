import { Command } from "@effect/cli"
import { NodeContext } from "@effect/platform-node"
import { Console, Effect } from "effect"
import type { Schema } from "effect"
import { extractSchema } from "@evryg/effect-neo4j-schema"
import { saveSchema } from "@evryg/effect-neo4j-schema"
import { compileToGraphSchema } from "@evryg/effect-neo4j-schema"
import { neo4jOptions, schemaPathOption, outputOption, cypherGlobOption, neo4jLayer, generateFromSchema } from "./Shared.js"

// ── generate live-db ──

const generateLiveDbCommand = Command.make(
  "live-db",
  { ...neo4jOptions, schemaPath: schemaPathOption, output: outputOption, cypherGlob: cypherGlobOption },
  (opts) =>
    Effect.gen(function* () {
      const schema = yield* extractSchema()
      yield* saveSchema(opts.schemaPath, schema)
      yield* Console.log(`Schema extracted: ${schema.vertexProperties.length} vertex properties`)
      yield* generateFromSchema(schema, opts.output, opts.cypherGlob)
    }).pipe(Effect.provide(neo4jLayer(opts)), Effect.provide(NodeContext.layer)),
)

// ── generate annotations ──

const makeGenerateAnnotationsCommand = (allSchemas: Schema.Schema.Any[]) => Command.make(
  "annotations",
  { output: outputOption, cypherGlob: cypherGlobOption },
  (opts) =>
    Effect.gen(function* () {
      const schema = compileToGraphSchema(allSchemas)
      yield* Console.log(`Schema compiled from annotations: ${schema.vertexProperties.length} vertex properties, ${schema.edgeProperties.length} edge properties`)
      yield* generateFromSchema(schema, opts.output, opts.cypherGlob)
    }),
)

// ── generate (parent) ──

export const makeGenerateCommand = (allSchemas: Schema.Schema.Any[]) => Command.make("generate").pipe(
  Command.withSubcommands([generateLiveDbCommand, makeGenerateAnnotationsCommand(allSchemas)]),
)
