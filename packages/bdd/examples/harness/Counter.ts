/** The same completed specification can use a service implementation. */
import { EffectInterpreter, run } from "@evryg/effect-bdd/effect"
import { Context, Effect } from "effect"
import { increment, incrementing, interpreter as model, rejectingUnderflow } from "../core/Counter.js"

class Arithmetic extends Context.Service<Arithmetic, {
  readonly add: (left: number, right: number) => Effect.Effect<number>
}>()("example/Arithmetic") {}
const arithmetic = { add: (left: number, right: number) => Effect.succeed(left + right) }
const [setupBinding, , decrementBinding, readsBinding, rejectsBinding] = model.bindings
export const system = EffectInterpreter.make(
  setupBinding,
  decrementBinding,
  readsBinding,
  rejectsBinding,
  EffectInterpreter.bind(increment, {
    execute: ([amount], context) =>
      Effect.flatMap(Arithmetic, (service) => service.add(context.count, amount))
        .pipe(Effect.provideService(Arithmetic, arithmetic)),
    update: (context, outcome) => ({ count: outcome._tag === "Success" ? outcome.value : context.count })
  })
)
// Both interpreters are deliberately complete; unused operation bindings add no requirements.
export const demo = Effect.gen(function*() {
  yield* run(incrementing, model)
  yield* run(incrementing, system)
  yield* run(rejectingUnderflow, system)
})
