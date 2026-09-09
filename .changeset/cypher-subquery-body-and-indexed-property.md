---
"@evryg/effect-cypher-codegen": minor
---

Accept EXISTS/COUNT subquery bodies that are bare reading clauses, and property access after a list index

`EXISTS { MATCH (a)-[:R]->(:B) }` and `items[0].rank` are both valid Cypher that Neo4j accepts, and both were rejected by the grammar. `subqueryExist` and `countSubquery` admitted only a full query or a bare pattern, so a brace body that is a reading clause on its own had no alternative; they now share a `subqueryBody` rule that also accepts `readingStatement+`. Separately, property access bound only to `atom` while indexing was applied outside the property chain, leaving no path back into `DOT name` after a `[...]`; `propertyExpression` is now `atom propertyPostfix*`, so dot access and single-element indexing compose in either order, and `listExpression` keeps only its `IN` and range forms. Type inference follows: indexing unwraps a list to its element type wherever it appears in the chain, property access resolves a field of a map type, and a range slice such as `a.tags[1..3]` now yields a list instead of the element type it was previously mis-typed as. No lexer token is added, so no word is taken away from `ID`.
