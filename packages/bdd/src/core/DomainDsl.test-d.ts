import { expectTypeOf } from "vitest"
import { Given, When } from "../index.js"

const cart = Given.define<{}, { books: ReadonlyArray<string> }>()("cart.empty", () => "an empty cart")
const add = When.define<{ books: ReadonlyArray<string> }, { title: string }, "missing">()(
  "cart.add",
  (title: string, price: number) => `${title} costs ${price}`
)
expectTypeOf(cart.id).toEqualTypeOf<"cart.empty">()
expectTypeOf(add("Book", 10).args).toEqualTypeOf<readonly [title: string, price: number]>()
