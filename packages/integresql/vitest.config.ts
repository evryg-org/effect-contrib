import { defineConfig, mergeConfig } from "vitest/config"
import { base, nodeIntegrationProject, unitProject } from "../../vitest.shared"

export default mergeConfig(base, defineConfig({
  test: {
    projects: [unitProject, nodeIntegrationProject("test/GlobalSetup.ts")]
  }
}))
