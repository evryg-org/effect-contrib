import type { GraphSchema } from "@evryg/effect-neo4j-schema"
import { readFileSync } from "node:fs"
import { generateModule } from "../backend/CypherCodegen.js"
import { analyzeQuery } from "../frontend/QueryAnalyzer.js"

export const cypherPlugin = (opts?: { schema?: GraphSchema }) => ({
  name: "vite-plugin-cypher",
  transform(_code: string, id: string) {
    if (id.endsWith(".cypher")) {
      const content = readFileSync(id, "utf-8").trim()
      const columns = opts?.schema ? analyzeQuery(content, opts.schema).columns : undefined
      return { code: generateModule(content, columns), map: null }
    }
  }
})
