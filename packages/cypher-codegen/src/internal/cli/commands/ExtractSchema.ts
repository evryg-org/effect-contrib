/** @since 0.0.1 */
import { NodeServices } from "@effect/platform-node"
import { extractSchema, saveSchema } from "@evryg/effect-neo4j-schema"
import { Console, Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { neo4jLayer, neo4jOptions, schemaPathOption } from "./Shared.js"

/**
 * @since 0.0.1
 * @category cli
 */
export const extractSchemaCommand = Command.make(
  "extract-schema",
  { ...neo4jOptions, schemaPath: schemaPathOption },
  (opts) =>
    Effect.gen(function*() {
      const schema = yield* extractSchema()
      yield* saveSchema(opts.schemaPath, schema)
      yield* Console.log(`Schema extracted and saved to ${opts.schemaPath}`)
      yield* Console.log(
        `  ${schema.vertexProperties.length} vertex properties, ${schema.edgeProperties.length} edge properties`
      )
    }).pipe(Effect.provide([neo4jLayer(opts), NodeServices.layer]))
)
