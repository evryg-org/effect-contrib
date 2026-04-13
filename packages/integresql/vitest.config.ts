import { defineConfig, mergeConfig } from "vitest/config"
import shared from "../../vitest.shared"

export default mergeConfig(
  shared,
  defineConfig({
    test: {
      name: "integresql-node-integration",
      include: ["src/**/*.test.{ts,mts,cts,tsx}"],
      globalSetup: ["src/globalSetup.ts"]
    }
  })
)
