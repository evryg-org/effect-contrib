---
"@evryg/effect-cypher-codegen": minor
---

Accept `FOREACH` and fail loudly on unparseable Cypher

`FOREACH ( x IN expr | updatingClause+ )` is valid Cypher that Neo4j accepts, but it had no lexer token and no parser rule, so any query using it was rejected by the grammar. The lexer gains a `FOREACH` keyword (also admitted as a `reservedWord`, so `foreach` stays usable as a property or map key), the parser gains a `foreachSt` rule, and `updatingStatement` gains it as an alternative. Because the type environment is extended only from the direct `createSt`/`mergeSt` children of an updating statement, the loop variable and anything merged or created inside a `FOREACH` body stay scoped to that body and cannot be resolved by a later `RETURN`. Separately, `analyzeQuery` used to strip ANTLR's error listeners and install nothing, so a query the grammar could not parse silently produced an empty column list — indistinguishable from a write-only query that legitimately projects nothing. Syntax errors from both the lexer and the parser are now collected and raised as a new exported `CypherSyntaxError` carrying the line, the column and the offending token; a parseable query with no `RETURN` still analyzes to zero columns.
