import { Context } from "effect"

export class Neo4jConfig extends Context.Tag("Neo4jConfig")<Neo4jConfig, {
  readonly uri: string
  readonly user: string
  readonly password: string
  readonly database: string
}>() {}

export type Neo4jConnectionConfig = Context.Tag.Service<typeof Neo4jConfig>
