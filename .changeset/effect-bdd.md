---
"@evryg/effect-bdd": patch
---

Add `@evryg/effect-bdd`, a runner-agnostic, inspectable Behaviour-Driven-Development DSL for Effect.

Author `Given / When / Then` scenarios with a type-safe, phase-typed builder that accumulates a named-key context, enforces step dependencies, and feeds each outcome (`then` / `thenFails` / `thenDies`) the correct payload type. A scenario is reified data, so the same value can be run under any test runner (assertion failures surface as a typed `ScenarioError`, never via a runner's `expect`), rendered to Gherkin, listed as steps, or projected to a serializable document. Reusable domain vocabularies can be built on top of the `given` / `when` / `assertion` combinators, with `feature` / `filterByTags` to group and select suites.
