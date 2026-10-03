import * as path from "node:path"
import type { ViteUserConfig } from "vitest/config"

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
