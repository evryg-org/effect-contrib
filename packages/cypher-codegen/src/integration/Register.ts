import { registerHooks } from "node:module"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { NodeContext } from "@effect/platform-node"
import { generateModule } from "../backend/CypherCodegen.js"
import { analyzeQuery } from "../frontend/QueryAnalyzer.js"
import { loadSchema, type GraphSchema } from "@evryg/effect-neo4j-schema"

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
        source: generateModule(source, columns),
      }
    }
    return nextLoad(url, context)
  },
})
