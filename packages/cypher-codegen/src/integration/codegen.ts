/** @since 0.0.1 */
import { Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import type { Schema } from "effect"
import { makeApplySchemaCommand } from "./cli/commands/ApplySchema.js"
import { extractSchemaCommand } from "./cli/commands/ExtractSchema.js"
import { makeGenerateCommand } from "./cli/commands/Generate.js"

/**
 * @since 0.0.1
 * @category cli
 */
export function runCodegenCli(allSchemas: Array<Schema.Schema.Any>): void {
  const rootCommand = Command.make("cypher-codegen").pipe(
    Command.withSubcommands([extractSchemaCommand, makeGenerateCommand(allSchemas), makeApplySchemaCommand(allSchemas)])
  )

  const cli = Command.run(rootCommand, { name: "cypher-codegen", version: "0.1.0" })

  cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain)
}
