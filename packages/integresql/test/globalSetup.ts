import type { TestProject } from "vitest/node"
import { startContainers } from "./startContainers.js"

export default async function setup(project: TestProject) {
  const resources = await startContainers()

  project.provide("containers", resources.config)

  // Kill the containers on every test run to ensure the templates are re-created on every run
  // (If you generate the template ids from file hashes, then you don't need that in your tests)
  // project.onTestsRerun(async () => {
  //   await resources.teardown()
  //   resources = await startContainers()
  //   project.provide("containers", resources.config)
  // })

  return () => resources.teardown()
}

declare module "vitest" {
  export interface ProvidedContext {
    containers: {
      integreSQL: { port: number; host: string }
      postgres: { port: number; host: string }
    }
  }
}
