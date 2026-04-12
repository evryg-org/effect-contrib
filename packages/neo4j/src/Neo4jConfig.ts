/**
 * @since 0.0.1
 */
import { Context } from "effect"

/**
 * @since 0.0.1
 * @category config
 */
export class Neo4jConfig extends Context.Tag("Neo4jConfig")<Neo4jConfig, {
  readonly uri: string
  readonly user: string
  readonly password: string
  readonly database: string
}>() {}

/**
 * @since 0.0.1
 * @category models
 */
export type Neo4jConnectionConfig = Context.Tag.Service<typeof Neo4jConfig>
