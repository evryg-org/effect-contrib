/** Probe observations are read inside vocabulary implementations, per execution. */
import { Scenario, Then } from "@evryg/effect-bdd"
import { EffectInterpreter, probe, run } from "@evryg/effect-bdd/effect"
import { Context, Effect } from "effect"
import { adds, anEmptyCart, book, interpreter as model } from "../core/Cart.js"

class Warehouse extends Context.Service<Warehouse, {
  readonly reserve: (title: string) => Effect.Effect<void>
}>()("example/Warehouse") {}
const warehouse = probe<string>()("warehouse", Warehouse, (record) => ({ reserve: (title) => record(title) }))
const reserved = Then.context<{}>()("warehouse.reserved", (title: string) => `the warehouse reserved ${title}`)
export const adding = Scenario.make("reserving a book").use(anEmptyCart).when(adds(book)).then(reserved(book.title))
  .build()
const [emptyBinding, , holdsBinding, costsBinding] = model.bindings
export const system = EffectInterpreter.make(
  emptyBinding,
  holdsBinding,
  costsBinding,
  EffectInterpreter.bind(adds, {
    execute: ([book]) =>
      Effect.gen(function*() {
        const port = yield* Warehouse
        yield* port.reserve(book.title)
        return book
      }).pipe(Effect.provide(warehouse.layer)),
    update: (context, outcome) => ({
      books: outcome._tag === "Success" ? [...context.books, outcome.value] : context.books
    })
  }),
  EffectInterpreter.bind(reserved, ([title]) =>
    Effect.flatMap(warehouse.calls, (calls) =>
      Effect.sync(() => {
        if (calls.length !== 1 || calls[0] !== title) throw new Error("Unexpected reservation calls")
      })))
)
export const demo = run(adding, system)
