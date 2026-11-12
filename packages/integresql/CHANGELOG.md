# @evryg/effect-integresql

## 0.2.0

### Minor Changes

- [#294](https://github.com/evryg-org/effect-contrib/pull/294) [`25aa9e4`](https://github.com/evryg-org/effect-contrib/commit/25aa9e4361b963ef15c09f01c618802720bafbb8) Thanks @NathanEvryg! - Move to Effect 4.1

  All packages now target Effect 4.1 (`4.1.4`). The `effect`, `@effect/platform-node` and `@effect/vitest` peer ranges are `^4.1.4`, so consumers must upgrade from the 4.0 betas. `@effect/vitest` 4.1 requires vitest 5.

  In `@evryg/effect-op-graph`, a `DeclaredFields` value is a `Schema.Constraint` instead of a `Schema.Top`, matching the fields of an Effect 4.1 `Schema.Struct`, so any struct's fields can be declared as they are. Code that reads a declared field and calls `Schema.Top` methods on it must narrow it first. The `@evryg/effect-op-graph/contract/laws` suite draws its samples with `effect/Arbitrary`, which replaces the fast-check that Effect 4.0 bundled.

## 0.1.0

### Minor Changes

- [`953fa72`](https://github.com/evryg-org/effect-contrib/commit/953fa720f1c44445b8f0a1b1f5b0057375ce0524) Thanks @jbmusso! - Migrate to Effect v4

  All packages now target Effect v4 (`4.0.0-beta.78`). `effect` and `@effect/platform-node` peer ranges are bumped to `^4.0.0-beta.78`, and the standalone `@effect/platform`, `@effect/cli`, and `@effect/sql` dependencies are dropped now that they are merged into core `effect`. Consumers must upgrade to Effect v4.
