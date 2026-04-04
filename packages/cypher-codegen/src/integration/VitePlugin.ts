import { readFileSync } from "node:fs"
import { Effect } from "effect"
import { NodeContext } from "@effect/platform-node"
import { generateModule } from "../backend/CypherCodegen"
import { analyzeQuery } from "../frontend/QueryAnalyzer"
import { loadSchema, type GraphSchema } from "../../effect-neo4j-schema/GraphSchemaModel"

export const cypherPlugin = (opts?: { schemaPath?: string }) => {
  let schema: GraphSchema | undefined
  if (opts?.schemaPath) {
    try {
      schema = Effect.runSync(loadSchema(opts.schemaPath).pipe(Effect.provide(NodeContext.layer)))
    } catch {
      // Schema not available — fall back to untyped codegen
    }
  }

  return {
    name: "vite-plugin-cypher",
    transform(_code: string, id: string) {
      if (id.endsWith(".cypher")) {
        const content = readFileSync(id, "utf-8").trim()
        const columns = schema ? analyzeQuery(content, schema).columns : undefined
        return { code: generateModule(content, columns), map: null }
      }
    },
  }
}
