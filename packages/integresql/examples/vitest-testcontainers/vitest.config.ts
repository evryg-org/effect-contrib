import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globalSetup: ["./globalSetup.ts"],
    include: ["**/*.test.ts"],
    watch: false
  }
})
