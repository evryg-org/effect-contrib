import * as path from "node:path"
import type { TestProjectInlineConfiguration, ViteUserConfig } from "vitest/config"

const target = process.env.TEST_DIST !== undefined ? "dist/dist/esm" : "src"

const alias = (pkg: string, folder?: string) => {
  const dir = folder ?? pkg
  const name = `@evryg/${pkg}`
  return ({
    [`${name}/test`]: path.join(__dirname, "packages", dir, "test"),
    [`${name}`]: path.join(__dirname, "packages", dir, target)
  })
}

// This is a workaround, see https://github.com/vitest-dev/vitest/issues/4744
const config: ViteUserConfig = {
  esbuild: {
    target: "es2020"
  },
  optimizeDeps: {
    exclude: ["bun:sqlite"]
  },
  test: {
    passWithNoTests: true,
    setupFiles: [path.join(__dirname, "setupTests.ts")],
    fakeTimers: {
      toFake: undefined
    },
    sequence: {
      concurrent: true
    },
    include: ["src/**/*.test.{ts,mts,cts,tsx}"],
    exclude: ["src/**/*.integration.test.{ts,mts,cts,tsx}"],
    alias: {
      ...alias("effect-integresql", "integresql"),
      ...alias("effect-neo4j", "neo4j"),
      ...alias("effect-testcontainers", "testcontainers"),
      ...alias("effect-vitest-neo4j", "vitest-neo4j"),
      ...alias("effect-testcontainers-neo4j", "testcontainers-neo4j"),
      ...alias("effect-neo4j-schema", "neo4j-schema"),
      ...alias("cypher-codegen"),
      ...alias("effect-bdd", "bdd"),
      "@evryg/effect-op-graph/contract/laws": path.join(__dirname, "packages", "op-graph", target, "GraphOpMaterializerLaws"),
      "@evryg/effect-op-graph/contract": path.join(
        __dirname,
        "packages",
        "op-graph",
        target,
        "_testing",
        "GraphOpMaterializerContract"
      ),
      ...alias("effect-op-graph", "op-graph")
    }
  }
}

export default config

const { exclude: unitExclude, include: unitInclude, ...baseTest } = config.test ?? {}

export const base: ViteUserConfig = { ...config, test: baseTest }

export const unitProject: TestProjectInlineConfiguration = {
  extends: true,
  test: { name: "unit", include: unitInclude, exclude: unitExclude }
}

export const nodeIntegrationProject = (globalSetup: string): TestProjectInlineConfiguration => ({
  extends: true,
  test: {
    name: "node-integration",
    include: ["src/**/*.node.integration.test.{ts,mts,cts,tsx}"],
    globalSetup: [globalSetup]
  }
})
