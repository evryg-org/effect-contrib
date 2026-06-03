---
"@evryg/effect-cypher-codegen": minor
---

Infer parameter nullability for `SET` clauses

`QueryAnalyzer` now types parameters bound via a `SET` clause (`MATCH (n:Label {...}) SET n.prop = $param`), in addition to node-pattern property maps and `IN` list expressions. A param assigned to an optional vertex property is typed `T | null` (so callers can pass `null` to clear it), while one assigned to a mandatory property stays non-nullable. Map-merge assignments (`SET n += $map`) are unaffected, and params whose left-hand side cannot be resolved to a schema property keep the previous non-nullable `String` fallback.
