import { defineConfig, mergeConfig } from "vitest/config"
import shared from "../../vitest.shared"

const { exclude: _unitOnlyExclude, ...sharedTest } = shared.test ?? {}

export default mergeConfig(shared, defineConfig({
  test: {
    sequence: { concurrent: false },
    projects: [
      {
        ...shared,
        test: {
          ...sharedTest,
          name: "node-integration",
          include: ["src/**/*.node.integration.test.{ts,mts,cts,tsx}"],
          globalSetup: ["./src/neo4j-global-setup.ts"],
        },
      },
    ],
  },
}))
