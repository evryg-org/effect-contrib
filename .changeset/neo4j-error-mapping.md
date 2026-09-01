---
"@evryg/effect-neo4j": minor
---

Derive `Neo4jQueryError.message` and `Neo4jConnectionError.message` from their `cause`.

Schema-backed tagged errors with structural fields have an empty `message` by default: `cause` is a
field on the class, not the thing `Error#message` reports, so every consumer had to reach into
`error.cause` themselves and hand-unwrap it (`cause instanceof Error ? cause.message : String(cause)`)
to get a useful message. Both error classes now override `message` to return exactly that — the
cause's message when `cause` is an `Error`, its stringified form otherwise — so the standard `Error`
surface (`.message`, `String(error)`, logging, `Cause` rendering, ...) just works. `Neo4jQueryError`'s
`cypher` remains available as a separate structured field for callers that want it; it's left out of
`message` since the cause text alone is what gets surfaced in practice.
