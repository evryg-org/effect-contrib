# @evryg/effect-bdd

A runner-agnostic, inspectable Behaviour-Driven-Development DSL for [Effect](https://effect.website).

Author `Given / When / Then` scenarios with a type-safe, phase-typed builder. A
scenario is **data**, not an `Effect` — so the same value can be **run** under
any test runner, **rendered** to Gherkin, or **inspected** as structure.

- **Runner-agnostic** — the core imports no test runner. A scenario's terminal
  is a plain `Effect`; run it with `@effect/vitest`, `node:test`, `bun:test`, or
  `Effect.runPromise`. Assertion failures surface as a typed `ScenarioError`, not
  via a runner's `expect`.
- **Inspectable** — a scenario is a reified term you can render to Gherkin, list
  the steps of, or project to a serializable document for `.feature` export.
- **Type-safe & combinator-based** — the phase-typed builder accumulates a
  named-key context, enforces step dependencies, and feeds each outcome
  (`then` / `thenFails` / `thenDies`) the correct payload type. Build reusable
  domain vocabularies on top of the `given` / `when` / `assertion` combinators.

## Installation

```sh
pnpm add @evryg/effect-bdd effect
```

`effect` is a peer dependency.

## Quick start

```ts
import { run, scenario } from "@evryg/effect-bdd"
import { Effect } from "effect"

const addingAnItem = scenario("adding to an empty cart", { tags: ["cart"] })
  .given("an empty cart", () => Effect.succeed({ items: [] as ReadonlyArray<string> }))
  .when("the user adds a book", (context) => Effect.succeed([...context.items, "book"]))
  .then("the cart holds one item", (items) => {
    if (items.length !== 1) throw new Error(`expected 1 item, got ${items.length}`)
  })
```

`addingAnItem` is a value. Run it under any runner:

```ts
import { it } from "@effect/vitest"

it.effect("adding to an empty cart", () => run(addingAnItem))

// …or without any runner at all:
Effect.runPromise(run(addingAnItem))
```

## Outcomes

Choose the expected outcome with the matching method; each receives the right
payload type:

```ts
scenario("removing from an empty cart")
  .when("the user removes an item", () => Effect.fail({ code: "EMPTY" } as const))
  .thenFails("it reports the cart is empty", (error) => {
    if (error.code !== "EMPTY") throw new Error("unexpected error")
  })

scenario("dividing by zero")
  .when("the calculator divides by zero", () => Effect.die(new Error("boom")))
  .thenDies("it dies with the cause", (defect) => {
    if (!(defect instanceof Error)) throw new Error("expected an Error defect")
  })
```

## Inspecting a scenario

```ts
import { steps, toDocument, toGherkin } from "@evryg/effect-bdd"

toGherkin(addingAnItem)
// @cart
// Scenario: adding to an empty cart
//   Given an empty cart
//   When the user adds a book
//   Then the cart holds one item

steps(addingAnItem)      // [{ keyword: "Given", text: … }, …]
toDocument(addingAnItem) // a serializable ScenarioDocument (validate/encode via its Schema)
```

## Features

Group scenarios and select a suite by tag:

```ts
import { feature, filterByTags, selectByTags } from "@evryg/effect-bdd"

const storefront = feature("storefront", [addingAnItem /*, … */])
const smoke = selectByTags(storefront, ["smoke"])
const cartScenarios = filterByTags(storefront.scenarios, ["cart"])
```

## Domain vocabularies (core mode)

The real power is building higher-level, constrained combinators on top of
`given` / `when` / `assertion`, so scenarios read as ubiquitous language and
misuse is a compile-time error. See [`examples/core/Cart.ts`](./examples/core/Cart.ts)
and [`examples/core/Counter.ts`](./examples/core/Counter.ts).

```ts
scenario("adding an item to an empty cart")
  .given(aCart().empty())
  .when(user.adds(item("book", 10)))
  .then(theCart.holds(1))
  .and(theCart.costs(10))
```

Because `user.adds` declares it *needs* a cart in its context, chaining it before
`aCart()` does not type-check.

## Harness mode — reified actions, probes & a preset

The `harness` layer adds what a per-domain Algebra + Interpreter buys, without
giving up the runner-agnostic, inspectable core:

- **`dispatcher`** turns a *reified command* (a tagged value) into a `When` via a
  per-tag handler map. The command is data, so the same command type can be
  driven by multiple dispatchers (run vs. dry-run vs. model).
- **`probe`** wraps a service in a `Layer.mock` with a call-log, capturing which
  methods the action invoked (indirect outputs).
- **`makeHarness`** bundles initial preconditions + probes + a dispatcher into a
  domain-specialized builder: `when` takes a **bare command**, `then` receives
  the recorded calls as an **injected observation object**, and `run`
  **auto-provides** the probe layers.

See [`examples/harness/Cart.ts`](./examples/harness/Cart.ts) and
[`examples/harness/Counter.ts`](./examples/harness/Counter.ts) — the same two
domains as the core examples, expressed via the preset.

```ts
const cart = makeHarness({ initial, probes: { ledger }, dispatch })

const adding = cart.scenario("adding an item")
  .when(addItem("book"))                       // a bare, reified command
  .then("the addition is recorded", ({ ledger }) => {
    if (ledger[0] !== "+book") throw new Error("not recorded")
  })

cart.run(adding) // probe layers auto-provided; still `toGherkin`-able
```

The harness is a thin composition over the core, so a harness scenario is still a
plain `Scenario` you can `toGherkin`, and assertion failures still surface as a
typed `ScenarioError` under any runner.
