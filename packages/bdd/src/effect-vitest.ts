/** Effect callbacks for @effect/vitest; callers may provide remaining services.
 * @since 0.0.1
 */
import { run } from "./core/Run.js"
import type { Ops, Scenario } from "./core/Scenario.js"
import type { AnyDefinition } from "./core/Step.js"
import type { AnyBinding, Coverage, Interpreter } from "./EffectInterpreter.js"

/** Create a lazy runner callback.
 * @since 0.0.1
 */
export const toTest = <S extends Scenario<AnyDefinition>, const B extends ReadonlyArray<AnyBinding>>(
  scenario: S,
  interpreter: Interpreter<B> & Coverage<Ops<S>, B>
) =>
() => run(scenario, interpreter)
