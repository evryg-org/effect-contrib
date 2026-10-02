# @evryg/effect-bdd

Author typed scenarios as ordered data, then render or execute them with separately supplied implementations. The same completed scenario can run against a model and a system adapter without reconstruction. No implementation handlers execute during authoring or rendering.

```ts
import { Given, Scenario, Steps, Then, When, toGherkin } from "@evryg/effect-bdd"
import { EffectInterpreter, run } from "@evryg/effect-bdd/effect"
import { Effect } from "effect"

const empty = Given.define<{}, { count: number }>()("counter.empty", () => "an empty counter")
const adds = When.define<{ count: number }, number>()("counter.add", (amount: number) => `adding ${amount}`)
const reads = Then.success<{}, number>()("counter.reads", (expected: number) => `the count is ${expected}`)
const starting = Steps.from(empty())
const scenario = Scenario.make("adding three")
  .use(starting).when(adds(3)).then(reads(3)).build()

const interpreter = EffectInterpreter.make(
  EffectInterpreter.bind(empty, () => Effect.succeed({ count: 0 })),
  EffectInterpreter.bind(adds, { execute: ([amount], context) => Effect.succeed(context.count + amount) }),
  EffectInterpreter.bind(reads, ([expected], _context, actual) => Effect.sync(() => {
    if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`)
  }))
)
console.log(toGherkin(scenario))
await Effect.runPromise(run(scenario, interpreter))
```

`Given.define<Needs, Patch>`, `When.define<Needs, A, E, Patch>`, and `Then.context<Needs>`, `Then.success<Needs, A>`, `Then.failure<Needs, E>` define vocabulary. IDs retain their literal types; description parameters determine argument tuples. Declare the domain contracts once at the vocabulary boundary. Scenario chains, fragments, binding callback parameters, and runner callbacks infer their types without caller annotations. Calling a definition creates a descriptor with arguments and text, without requiring a schema. Implementations receive `(args, context)` and assertions additionally receive their typed success value or domain error.

The fluent builder and dual module combinators share their type rules:

```ts
const equivalent = Scenario.make("adding three").pipe(
  Scenario.use(starting),
  Scenario.when(adds(3)),
  Scenario.then(reads(3)),
  Scenario.build
)
```

Combinators also accept `Scenario.when(builder, adds(3))`. Only `.build()` produces a completed, immutable, non-thenable scenario suitable for execution, rendering, or grouping. `And` and `But` inherit the preceding semantic kind; `But` does not negate an assertion. Steps execute in authored order, including repeated actions and assertion stages. Context checks may appear without an action. Prefer short scenarios describing one behavior.

Compose descriptors with `Steps.from(...)`, `Steps.empty`, and dual `Steps.concat`. `.use(fragment)` checks dependencies and assertion subjects at the application site and flattens the fragment into reported steps. Compatible fragments have an identity and associative composition; changing execution order can change behavior. Context merges are right-biased: overwritten fields take their replacement type, while unrelated fields survive. Patches must be named-field records with required top-level fields; primitives, arrays, and optional top-level fields are rejected. Required fields may contain `undefined`. Inferred setup and update results reject undeclared patch fields that could overwrite unrelated caller context.

An action declaring a nonempty patch must implement `update(context, outcome)`, returning that patch for both `{ _tag: "Success", value }` and `{ _tag: "Failure", error }`. Use named context fields to retain earlier outcomes when a workflow needs them. Each operation retains its own result, domain error, and service requirements. An interpreter must cover every operation used by the scenario; unused bindings do not add service requirements.

`Then.failure` declares expected domain failure in the vocabulary, so specifications use ordinary `.then(rejects())`. A failed action requires a matching failure assertion before another action or completion. Context checks cannot acknowledge failures. Defects fail execution, mixed failure/defect causes cannot satisfy domain failure checks, and interruption propagates. Diagnostics retain the complete cause, step description, and original assertion errors.

Each execution allocates its world, observation log, and resource scope anew, including retries. The `/effect` entry exports `probe` and execution-scoped `Observations`; implementations access probe calls as Effects. Provide probe layers inside implementations so they can access execution services. Resource finalizers run when the scenario ends.

Runner adapters are explicit entry points:

```ts
import { it } from "vitest"
import { toTest } from "@evryg/effect-bdd/vitest"
it(scenario.name, toTest(scenario, interpreter))
```

```ts
import { it } from "@effect/vitest"
import { toTest } from "@evryg/effect-bdd/effect-vitest"
it.effect(scenario.name, toTest(scenario, interpreter))
```

The Vitest adapter returns a Promise callback and rejects unprovided services at compile time. Provide services in its bindings. The Effect adapter returns an Effect callback whose requirements can be supplied by `@effect/vitest` layers or `Effect.provide`.

`feature`, `filterByTags`, and `selectByTags` retain heterogeneous scenario requirements. `steps`, `tags`, `toGherkin`, and `toDocument` inspect completed scenarios without executing handlers. Document projection is inspectable metadata, not serialization of executable specifications. Specifications remain embedded TypeScript; parameter functions and row mapping cover data-driven cases. Dedicated Rule, Background, Scenario Outline, and `.feature` parsing are outside this API.

See [cart vocabulary](examples/core/Cart.ts), [counter failures](examples/core/Counter.ts), [service interpreter](examples/harness/Counter.ts), and [probe observations](examples/harness/Cart.ts).

Compatibility checks use separate, unpatched compilers and a standalone configuration without compiler plugins:

```sh
TS59_TSC=/path/to/typescript-5.9.3/bin/tsc TS7_TSC=/path/to/typescript-7/bin/tsc pnpm check:compat
TS59_TSC=/path/to/typescript-5.9.3/bin/tsc TS7_TSC=/path/to/typescript-7/bin/tsc pnpm check:packed
```

The same public consumer `compat/public-api.test.ts` fixture checks exact inference and expected compile errors against source and packed declarations under both compilers. The packed check also validates the export allowlist and ESM/CJS imports from the actual package archive. The BDD public API CI job repeats these checks with isolated, unpatched compiler installations.
