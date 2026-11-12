import { defineConfig, mergeConfig } from "vitest/config"
import { base, nodeIntegrationProject, unitProject } from "../../vitest.shared"
import { cypherPlugin } from "./src/VitePlugin.ts"

export default mergeConfig(base, defineConfig({
  plugins: [cypherPlugin()],
  test: {
    projects: [unitProject, nodeIntegrationProject("../vitest-neo4j/src/neo4j-global-setup.ts")]
  }
}))
