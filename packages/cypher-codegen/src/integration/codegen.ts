import { Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { extractSchemaCommand } from "./cli/commands/ExtractSchema"
import { generateCommand } from "./cli/commands/Generate"
import { applySchemaCommand } from "./cli/commands/ApplySchema"

const rootCommand = Command.make("cypher-codegen").pipe(
  Command.withSubcommands([extractSchemaCommand, generateCommand, applySchemaCommand]),
)

const cli = Command.run(rootCommand, { name: "cypher-codegen", version: "0.1.0" })

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain)
