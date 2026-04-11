import { defineConfig, mergeConfig } from "vitest/config"
import shared from "../vitest.shared"

export default mergeConfig(shared, defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node-integration",
          include: ["src/**/*.node.integration.test.{ts,mts,cts,tsx}"],
          globalSetup: ["../vitest-neo4j/src/neo4j-global-setup.ts"],
        },
      },
    ],
  },
}))
