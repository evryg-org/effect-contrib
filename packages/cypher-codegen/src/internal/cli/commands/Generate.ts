/** @since 0.0.1 */
import { NodeServices } from "@effect/platform-node"
import type { AssembledGraphSchema } from "@evryg/effect-neo4j-schema"
import { extractSchema, saveSchema } from "@evryg/effect-neo4j-schema"
import { Console, Effect } from "effect"
import { Command } from "effect/unstable/cli"
import {
  cypherGlobOption,
  generateFromSchema,
  neo4jLayer,
  neo4jOptions,
  outputOption,
  schemaPathOption
} from "./Shared.js"

// ── generate live-db ──

const generateLiveDbCommand = Command.make(
  "live-db",
  { ...neo4jOptions, schemaPath: schemaPathOption, output: outputOption, cypherGlob: cypherGlobOption },
  (opts) =>
    Effect.gen(function*() {
      const schema = yield* extractSchema()
      yield* saveSchema(opts.schemaPath, schema)
      yield* Console.log(`Schema extracted: ${schema.vertexProperties.length} vertex properties`)
      yield* generateFromSchema(schema, opts.output, opts.cypherGlob)
    }).pipe(Effect.provide([neo4jLayer(opts), NodeServices.layer]))
)

// ── generate annotations ──

const makeGenerateAnnotationsCommand = (assembled: AssembledGraphSchema) =>
  Command.make(
    "annotations",
    { output: outputOption, cypherGlob: cypherGlobOption },
    (opts) =>
      Effect.gen(function*() {
        const schema = assembled.graphSchema()
        yield* Console.log(
          `Schema compiled from annotations: ${schema.vertexProperties.length} vertex properties, ${schema.edgeProperties.length} edge properties`
        )
        yield* generateFromSchema(schema, opts.output, opts.cypherGlob)
      })
  )

// ── generate (parent) ──

/**
 * @since 0.0.1
 * @category cli
 */
export const makeGenerateCommand = (schema: AssembledGraphSchema) =>
  Command.make("generate").pipe(
    Command.withSubcommands([generateLiveDbCommand, makeGenerateAnnotationsCommand(schema)])
  )
