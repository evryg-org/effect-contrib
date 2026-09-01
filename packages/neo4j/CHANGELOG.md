# @evryg/effect-neo4j

## 0.2.0

### Minor Changes

- [#181](https://github.com/evryg-org/effect-contrib/pull/181) [`f9d052d`](https://github.com/evryg-org/effect-contrib/commit/f9d052ddfc2d5a5960af79f6eb5fbf7aea0c083c) Thanks @jbmusso! - Derive `Neo4jQueryError.message` and `Neo4jConnectionError.message` from their `cause`.

  Schema-backed tagged errors with structural fields have an empty `message` by default: `cause` is a
  field on the class, not the thing `Error#message` reports, so every consumer had to reach into
  `error.cause` themselves and hand-unwrap it (`cause instanceof Error ? cause.message : String(cause)`)
  to get a useful message. Both error classes now override `message` to return exactly that — the
  cause's message when `cause` is an `Error`, its stringified form otherwise — so the standard `Error`
  surface (`.message`, `String(error)`, logging, `Cause` rendering, ...) just works. `Neo4jQueryError`'s
  `cypher` remains available as a separate structured field for callers that want it; it's left out of
  `message` since the cause text alone is what gets surfaced in practice.

## 0.1.0

### Minor Changes

- [`953fa72`](https://github.com/evryg-org/effect-contrib/commit/953fa720f1c44445b8f0a1b1f5b0057375ce0524) Thanks @jbmusso! - Migrate to Effect v4

  All packages now target Effect v4 (`4.0.0-beta.78`). `effect` and `@effect/platform-node` peer ranges are bumped to `^4.0.0-beta.78`, and the standalone `@effect/platform`, `@effect/cli`, and `@effect/sql` dependencies are dropped now that they are merged into core `effect`. Consumers must upgrade to Effect v4.
