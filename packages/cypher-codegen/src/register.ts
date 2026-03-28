import { registerHooks } from "node:module"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { generateModule } from "./cypher-codegen"

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
      return {
        format: "module",
        shortCircuit: true,
        source: generateModule(source),
      }
    }
    return nextLoad(url, context)
  },
})
