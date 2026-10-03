/** @since 0.0.1 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import type { AssembledGraphSchema } from "@evryg/effect-neo4j-schema"
import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { makeApplySchemaCommand } from "./internal/cli/commands/ApplySchema.js"
import { extractSchemaCommand } from "./internal/cli/commands/ExtractSchema.js"
import { makeGenerateCommand } from "./internal/cli/commands/Generate.js"

/**
 * @since 0.0.1
 * @category cli
 */
export function runCodegenCli(schema: AssembledGraphSchema): void {
  const rootCommand = Command.make("cypher-codegen").pipe(
    Command.withSubcommands([extractSchemaCommand, makeGenerateCommand(schema), makeApplySchemaCommand(schema)])
  )

  Command.run(rootCommand, { version: "0.1.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain
  )
}
