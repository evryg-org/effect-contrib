/**
 * Harness-mode example: the same cart domain as `../core/Cart.ts`, but via the
 * preset harness — commands are a `Schema.TaggedUnion` (the tag is managed by
 * Effect; build values with `cases.<Tag>.make(...)`), the recorded calls of a
 * probed port are injected into `then`, and the probe layer is auto-provided by
 * `run`. Scenarios stay inspectable (`toGherkin` still works).
 *
 * Run with: `npx tsx packages/bdd/examples/harness/Cart.ts`
 */
import { dispatcher, makeHarness, probe, toGherkin } from "@evryg/effect-bdd"
import { Context, Effect, Schema } from "effect"

// ── Domain ──
interface Cart {
  readonly items: ReadonlyArray<string>
}

// Reified commands — a tagged union; construct with `cases.<Tag>.make(...)`.
const CartCommand = Schema.TaggedUnion({
  AddItem: { name: Schema.String },
  RemoveItem: { name: Schema.String }
})
const addItem = (name: string) => CartCommand.cases.AddItem.make({ name })
const removeItem = (name: string) => CartCommand.cases.RemoveItem.make({ name })

// A secondary port whose calls we want to observe.
class Ledger extends Context.Service<Ledger, {
  readonly record: (entry: string) => Effect.Effect<void>
}>()("Ledger") {}

// The cart harness, defined once.
const ledger = probe<string>()("ledger", Ledger, (record) => ({ record: (entry) => record(entry) }))

const cart = makeHarness({
  initial: { items: [] } as Cart,
  probes: { ledger },
  dispatch: dispatcher<Cart, Cart, never, Ledger>()(
    CartCommand,
    {
      AddItem: (command) => (state) =>
        Effect.gen(function*() {
          const book = yield* Ledger
          yield* book.record(`+${command.name}`)
          return { items: [...state.items, command.name] }
        }),
      RemoveItem: (command) => (state) =>
        Effect.gen(function*() {
          const book = yield* Ledger
          yield* book.record(`-${command.name}`)
          return { items: state.items.filter((item) => item !== command.name) }
        })
    },
    (command) =>
      CartCommand.match(command, {
        AddItem: (item) => `the user adds ${item.name}`,
        RemoveItem: (item) => `the user removes ${item.name}`
      })
  )
})

// ── Scenarios: bare commands in `when`, observations injected into `then` ──
const addingAnItem = cart.scenario("adding an item to an empty cart", { tags: ["cart"] })
  .when(addItem("book"))
  .then("the addition is recorded", ({ ledger }) => {
    if (ledger.length !== 1 || ledger[0] !== "+book") {
      throw new Error(`unexpected ledger: [${ledger.join(", ")}]`)
    }
  })

const removingAnItem = cart.scenario("removing a stocked item")
  .given((state) => ({ items: [...state.items, "pen"] }))
  .when(removeItem("pen"))
  .then("the removal is recorded", ({ ledger }) => {
    if (ledger[0] !== "-pen") throw new Error(`unexpected ledger: [${ledger.join(", ")}]`)
  })

const demo = Effect.gen(function*() {
  yield* cart.run(addingAnItem) // probe layer auto-provided, call-log reset per run
  yield* cart.run(removingAnItem)
  yield* Effect.sync(() => {
    console.log(toGherkin(addingAnItem))
    console.log()
    console.log(toGherkin(removingAnItem))
  })
})

void Effect.runPromise(demo)
