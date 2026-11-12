import { defineConfig, mergeConfig } from "vitest/config"
import { base, nodeIntegrationProject, unitProject } from "../../vitest.shared"

export default mergeConfig(base, defineConfig({
  test: {
    sequence: { concurrent: false },
    projects: [unitProject, nodeIntegrationProject("./src/neo4j-global-setup.ts")]
  }
}))
