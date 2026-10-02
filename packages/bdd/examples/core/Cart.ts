import { Given, Scenario, Steps, Then, toGherkin, When } from "@evryg/effect-bdd"
import { EffectInterpreter, run } from "@evryg/effect-bdd/effect"
import { Effect } from "effect"

export interface Book {
  readonly title: string
  readonly price: number
}
export interface Cart {
  readonly books: ReadonlyArray<Book>
}
export const empty = Given.define<{}, Cart>()("cart.empty", () => "an empty cart")
export const adds = When.define<Cart, Book, never, Cart>()(
  "cart.add",
  (book: Book) => `the customer adds ${book.title}`
)
export const holds = Then.context<Cart>()("cart.holds", (count: number) => `the cart holds ${count} books`)
export const costs = Then.context<Cart>()("cart.costs", (total: number) => `the cart costs ${total}`)
export const anEmptyCart = Steps.from(empty())
export const book = { title: "The Hobbit", price: 10 }
export const adding = Scenario.make("adding a book")
  .use(anEmptyCart).when(adds(book)).then(holds(1)).and(costs(10))
export const equivalent = Scenario.make("adding a book")
  .pipe(Scenario.use(anEmptyCart), Scenario.when(adds(book)), Scenario.then(holds(1)), Scenario.and(costs(10)))
export const interpreter = EffectInterpreter.make(
  EffectInterpreter.bind(empty, () => Effect.succeed({ books: [] })),
  EffectInterpreter.bind(adds, {
    execute: ([book]) => Effect.succeed(book),
    update: (context, outcome) => ({
      books: outcome._tag === "Success" ? [...context.books, outcome.value] : context.books
    })
  }),
  EffectInterpreter.bind(holds, ([expected], context) =>
    Effect.sync(() => {
      if (context.books.length !== expected) throw new Error("Wrong number of books")
    })),
  EffectInterpreter.bind(costs, ([expected], context) =>
    Effect.sync(() => {
      if (context.books.reduce((total, book) => total + book.price, 0) !== expected) throw new Error("Wrong total")
    }))
)
export const gherkin = toGherkin(adding)
export const demo = run(adding, interpreter)
