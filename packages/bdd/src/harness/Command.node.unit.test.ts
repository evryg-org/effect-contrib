import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { run, scenario } from "../index.js"
import { dispatcher } from "./Command.js"

interface HasItems {
  readonly items: ReadonlyArray<string>
}

const CartCommand = Schema.TaggedUnion({
  AddItem: { name: Schema.String },
  RemoveItem: { name: Schema.String }
})

const addItem = (name: string) => CartCommand.cases.AddItem.make({ name })

const apply = dispatcher<HasItems, ReadonlyArray<string>>()(
  CartCommand,
  {
    AddItem: (command) => (context) => Effect.succeed([...context.items, command.name]),
    RemoveItem: (command) => (context) => Effect.succeed(context.items.filter((item) => item !== command.name))
  },
  (command) =>
    CartCommand.match(command, {
      AddItem: (item) => `the user adds ${item.name}`,
      RemoveItem: (item) => `the user removes ${item.name}`
    })
)

describe("Command dispatcher", () => {
  it.effect("dispatches a reified command to its handler", () =>
    run(
      scenario("adding via a command")
        .given("a cart with a pen", () => Effect.succeed({ items: ["pen"] as ReadonlyArray<string> }))
        .when(apply(addItem("book")))
        .then("both items are present", (items) => {
          expect(items).toEqual(["pen", "book"])
        })
    ))

  it("derives the step description from the command", () => {
    expect(apply(addItem("book")).description).toBe("the user adds book")
    expect(apply(CartCommand.cases.RemoveItem.make({ name: "pen" })).description).toBe("the user removes pen")
  })

  it.effect("re-interprets the same command type with a second dispatcher", () => {
    // a dry-run interpreter over the same command union that never mutates
    const dryRun = dispatcher<HasItems, ReadonlyArray<string>>()(
      CartCommand,
      {
        AddItem: () => (context) => Effect.succeed(context.items),
        RemoveItem: () => (context) => Effect.succeed(context.items)
      },
      () => "a no-op step"
    )

    return run(
      scenario("dry run leaves the cart unchanged")
        .given("a cart with a pen", () => Effect.succeed({ items: ["pen"] as ReadonlyArray<string> }))
        .when(dryRun(addItem("book")))
        .then("the cart is unchanged", (items) => {
          expect(items).toEqual(["pen"])
        })
    )
  })
})
