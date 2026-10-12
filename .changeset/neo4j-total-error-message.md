---
"@evryg/effect-neo4j": patch
---

Make `Neo4jQueryError.message` and `Neo4jConnectionError.message` total over any `cause`.

Reading `message` used to stringify a non-`Error` cause with `String(cause)`, which throws a `TypeError` ("Cannot convert object to primitive value") on a null-prototype object or on an object whose `toString`, `valueOf` or `Symbol.toPrimitive` throws. Some test runners replace an error's `cause` with a null-prototype copy before reporting it (e.g. vitest's `processError`), so the original failure was hidden behind that `TypeError`.

`message` now reads the cause's `message` and `code` structurally, so an `Error`, a plain object or a null-prototype copy of one report the same text, and appends the code in parentheses when there is one (e.g. `Invalid input 'X' (Neo.ClientError.Statement.SyntaxError)`). Any other cause is rendered with Effect's `Formatter.format`. Reading `message` never throws.
