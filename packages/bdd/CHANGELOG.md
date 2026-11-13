# @evryg/effect-bdd

## 0.1.0

### Minor Changes

- [#294](https://github.com/evryg-org/effect-contrib/pull/294) [`25aa9e4`](https://github.com/evryg-org/effect-contrib/commit/25aa9e4361b963ef15c09f01c618802720bafbb8) Thanks @NathanEvryg! - Move to Effect 4.1

  All packages now target Effect 4.1 (`4.1.4`). The `effect`, `@effect/platform-node` and `@effect/vitest` peer ranges are `^4.1.4`, so consumers must upgrade from the 4.0 betas. `@effect/vitest` 4.1 requires vitest 5.

  In `@evryg/effect-op-graph`, a `DeclaredFields` value is a `Schema.Constraint` instead of a `Schema.Top`, matching the fields of an Effect 4.1 `Schema.Struct`, so any struct's fields can be declared as they are. Code that reads a declared field and calls `Schema.Top` methods on it must narrow it first. The `@evryg/effect-op-graph/contract/laws` suite draws its samples with `effect/Arbitrary`, which replaces the fast-check that Effect 4.0 bundled.

## 0.0.1

### Patch Changes

- [#107](https://github.com/evryg-org/effect-contrib/pull/107) [`8be2b55`](https://github.com/evryg-org/effect-contrib/commit/8be2b553074c0ab77ddde8044a44efb7f892600f) Thanks @jbmusso! - Add an implementation-independent BDD vocabulary with typed Given, When, and Then descriptors, ordered fluent and pipe builders, and reusable step fragments. Every fluent prefix is immutable scenario data that can be rendered, inspected, grouped, filtered, and run under multiple interpreters.

  Separate Effect bindings from authoring, preserve each operation's result/error/service requirements, and merge named context patches with replacement semantics. Runs allocate independent worlds, observations, and scopes; capture synchronous implementation throws and complete causes; and require domain failures to be acknowledged by matching failure assertions. Export explicit `/effect`, `/vitest`, and `/effect-vitest` integrations.
