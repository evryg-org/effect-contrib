/**
 * @since 0.0.1
 */
import type { Effect } from "effect"
import { Context } from "effect"
import type { GraphSchema } from "./GraphSchemaModel.js"

/**
 * @since 0.0.1
 * @category resolvers
 */
export class GraphSchemaResolver extends Context.Tag("GraphSchemaResolver")<
  GraphSchemaResolver,
  { readonly resolve: Effect.Effect<GraphSchema> }
>() {}
