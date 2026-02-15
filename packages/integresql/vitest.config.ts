import { mergeConfig, type UserConfigExport } from "vitest/config"
import shared from "../../vitest.shared.js"

const config: UserConfigExport = {
  test: {
    globalSetup: ["./test/globalSetup.ts"],
    watch: false
  }
}

export default mergeConfig(shared, config)
