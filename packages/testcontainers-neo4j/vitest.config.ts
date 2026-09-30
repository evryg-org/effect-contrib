import { defineConfig, mergeConfig } from "vitest/config"
import shared from "../../vitest.shared"

const { exclude: _unitOnlyExclude, ...sharedTest } = shared.test ?? {}

export default mergeConfig(shared, defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          ...sharedTest,
          name: "node-integration",
          include: ["src/**/*.node.integration.test.{ts,mts,cts,tsx}"],
          globalSetup: ["../vitest-neo4j/src/neo4j-global-setup.ts"],
        },
      },
    ],
  },
}))
