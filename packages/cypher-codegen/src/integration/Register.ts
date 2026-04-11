import { NodeContext } from "@effect/platform-node"
import { type GraphSchema, loadSchema } from "@evryg/effect-neo4j-schema"
import { Effect } from "effect"
import { readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath } from "node:url"
import { generateModule } from "../backend/CypherCodegen.js"
import { analyzeQuery } from "../frontend/QueryAnalyzer.js"

let schema: GraphSchema | undefined
try {
  schema = Effect.runSync(loadSchema("data/graph-schema.json").pipe(Effect.provide(NodeContext.layer)))
} catch {
  // Schema not available — fall back to untyped codegen
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".cypher")) {
      const resolved = nextResolve(specifier, context)
      return { ...resolved, format: "cypher" }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (context.format === "cypher" || url.endsWith(".cypher")) {
      const source = readFileSync(fileURLToPath(url), "utf-8").trim()
      const columns = schema ? analyzeQuery(source, schema).columns : undefined
      return {
        format: "module",
        shortCircuit: true,
        source: generateModule(source, columns)
      }
    }
    return nextLoad(url, context)
  }
})
