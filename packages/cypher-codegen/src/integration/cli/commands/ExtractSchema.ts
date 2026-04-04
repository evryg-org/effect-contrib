import { Command } from "@effect/cli"
import { Console, Effect } from "effect"
import { NodeContext } from "@effect/platform-node"
import { extractSchema } from "@/lib/effect-neo4j-schema/resolvers/live_db/LiveDbGraphSchemaResolver"
import { saveSchema } from "@/lib/effect-neo4j-schema/GraphSchemaModel"
import { neo4jOptions, schemaPathOption, neo4jLayer } from "./Shared"

export const extractSchemaCommand = Command.make(
  "extract-schema",
  { ...neo4jOptions, schemaPath: schemaPathOption },
  (opts) =>
    Effect.gen(function* () {
      const schema = yield* extractSchema()
      yield* saveSchema(opts.schemaPath, schema)
      yield* Console.log(`Schema extracted and saved to ${opts.schemaPath}`)
      yield* Console.log(`  ${schema.vertexProperties.length} vertex properties, ${schema.edgeProperties.length} edge properties`)
    }).pipe(Effect.provide(neo4jLayer(opts)), Effect.provide(NodeContext.layer)),
)
