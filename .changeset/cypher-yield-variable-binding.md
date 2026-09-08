---
"@evryg/effect-cypher-codegen": minor
---

`analyzeQuery` binds variables introduced by a `CALL ... YIELD` clause

The grammar already parses a standalone procedure call with a YIELD clause (`CALL proc(...) YIELD a, b`) without error, but `analyzeQuery`'s reading-statement walk only branched on `matchSt()` and `unwindSt()` — `queryCallSt()` was never checked, so the names introduced by YIELD never entered the type environment. Any query with a `WITH` or `RETURN` referencing a yielded name (e.g. after `CALL db.index.fulltext.queryNodes(...) YIELD node, score`) threw `CypherTypeError: Unbound variable`. Yielded names are now bound as `UnknownType` (non-nullable), mirroring the alias in `yieldItem : (symbol AS)? symbol` when one is present. Purely additive: no query that previously analyzed successfully changes meaning.

Follow-up not addressed here: a standalone `CALL proc()` with no `RETURN` at all routes through a different code path (`standaloneCall`) that can throw on a null `regularQuery()`; that is a separate, pre-existing gap.
