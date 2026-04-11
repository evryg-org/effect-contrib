import { Effect, Context } from "effect"
import type { GraphSchema } from "./GraphSchemaModel.js"

export class GraphSchemaResolver extends Context.Tag("GraphSchemaResolver")<
  GraphSchemaResolver,
  { readonly resolve: Effect.Effect<GraphSchema> }
>() {}
