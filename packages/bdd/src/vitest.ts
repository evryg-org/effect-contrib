/** Promise callbacks for Vitest require implementations with all services provided.
 * @since 0.0.1
 */
import { Effect } from "effect"
import type { RunRequirements } from "./core/Run.js"
import { run } from "./core/Run.js"
import type { Ops, Scenario } from "./core/Scenario.js"
import type { AnyDefinition } from "./core/Step.js"
import type { AnyBinding, Coverage, Interpreter } from "./EffectInterpreter.js"

/** Create a lazy runner callback.
 * @since 0.0.1
 */
export const toTest = <S extends Scenario<AnyDefinition>, const B extends ReadonlyArray<AnyBinding>>(
  scenario: S,
  interpreter:
    & Interpreter<B>
    & Coverage<Ops<S>, B>
    & ([RunRequirements<Ops<S>, B>] extends [never] ? unknown
      : { readonly unprovidedServices: RunRequirements<Ops<S>, B> })
): () => Promise<void> =>
() => Effect.runPromise(run(scenario, interpreter) as Effect.Effect<void, unknown>)
