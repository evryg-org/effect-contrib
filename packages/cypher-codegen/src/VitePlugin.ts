import { readFileSync } from "node:fs"
import { generateModule } from "./CypherCodegen"

export const cypherPlugin = () => ({
  name: "vite-plugin-cypher",
  transform(_code: string, id: string) {
    if (id.endsWith(".cypher")) {
      const content = readFileSync(id, "utf-8").trim()
      return { code: generateModule(content), map: null }
    }
  },
})
