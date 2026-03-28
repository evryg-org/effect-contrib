import { registerHooks } from "node:module"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { generateModule } from "./CypherCodegen"
import { analyzeQuery } from "./QueryAnalyzer"
import { loadSchema, type GraphSchema } from "./GraphSchemaModel"

let schema: GraphSchema | undefined
try {
  schema = loadSchema("data/graph-schema.json")
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
