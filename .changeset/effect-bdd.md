---
"@evryg/effect-bdd": patch
---

Add `@evryg/effect-bdd`, a runner-agnostic, inspectable Behaviour-Driven-Development DSL for Effect.

Author `Given / When / Then` scenarios with a type-safe, phase-typed builder that accumulates a named-key context, enforces step dependencies, and feeds each outcome (`then` / `thenFails` / `thenDies`) the correct payload type. A scenario is reified data, so the same value can be run under any test runner (assertion failures surface as a typed `ScenarioError`, never via a runner's `expect`), rendered to Gherkin, listed as steps, or projected to a serializable document. Reusable domain vocabularies can be built on top of the `given` / `when` / `assertion` combinators, with `feature` / `filterByTags` to group and select suites.

A `harness` layer adds reified, re-interpretable actions and a port-spy/observation harness on top of the core: `dispatcher` turns a tagged command value into a `When`, `probe` captures a service's calls via `Layer.mock`, and `makeHarness` bundles preconditions, probes and a dispatcher into a per-domain builder where `when` takes a bare command, `then` receives the recorded calls as an injected observation object, and `run` auto-provides the probe layers — all as a pure composition over the (untouched) core.
