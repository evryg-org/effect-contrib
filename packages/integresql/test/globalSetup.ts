import type { TestProject } from "vitest/node"
import { startContainers } from "./startContainers.js"

export default async function setup(project: TestProject) {
  const resources = await startContainers()
  project.provide("containers", resources.config)
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
