import { defineConfig, mergeConfig } from "vitest/config"
import shared from "../../vitest.shared"
import { cypherPlugin } from "./src/VitePlugin.ts"

export default mergeConfig(shared, defineConfig({
  plugins: [cypherPlugin()],
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
