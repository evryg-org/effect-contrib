/**
 * Reified, re-interpretable actions.
 *
 * Commands are a `Schema.TaggedUnion` — data whose discriminant is managed by
 * Effect (you never write the tag field by hand: construct values with the
 * union's `cases.<Tag>.make(...)`). A dispatcher turns a command into a core
 * `When` by dispatching through the union's `match`; because the command is
 * data, the same union can be driven by different dispatchers (run vs. dry-run
 * vs. model), which is the re-interpretability an initial encoding buys.
 *
 * @since 0.0.1
 */
import type { Effect, Schema } from "effect"
import type { When } from "../core/Step.js"

/**
 * The value type of a command `Schema.TaggedUnion`.
 *
 * @since 0.0.1
 * @category models
 */
export type CommandOf<Cases extends Record<string, Schema.Top>> = Schema.Schema.Type<Schema.TaggedUnion<Cases>>

/**
 * A per-case handler map for a command union: each case maps to the action it
 * performs in a context.
 *
 * @since 0.0.1
 * @category models
 */
export type Handlers<Cases extends Record<string, Schema.Top>, Ctx, A, E, R> = {
  readonly [K in keyof Cases]: (command: Cases[K]["Type"]) => (context: Ctx) => Effect.Effect<A, E, R>
}

/**
 * Build a dispatcher for a context `Ctx`: it turns a command from `commands`
 * into a core {@link When}, dispatching through the union's `match` and
 * labelling the step with `describe`. Define several dispatchers over the same
 * union to interpret it more than one way.
 *
 * @since 0.0.1
 * @category constructors
 */
export const dispatcher = <Ctx, A, E = never, R = never>() =>
<Cases extends Record<string, Schema.Top>>(
  commands: Schema.TaggedUnion<Cases>,
  handlers: Handlers<Cases, Ctx, A, E, R>,
  describe: (command: CommandOf<Cases>) => string
): (command: CommandOf<Cases>) => When<Ctx, A, E, R> => {
  const toAction = commands.match(handlers)
  return (command) => ({
    description: describe(command),
    action: (context) => toAction(command)(context)
  })
}
