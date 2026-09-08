---
"@evryg/effect-cypher-codegen": minor
---

Type fulltext procedure results from declared index labels

`CALL db.index.fulltext.queryNodes("name", ...) YIELD node, score` bound both yielded variables as `UnknownType`, so property access on `node` degraded to the `Neo4jValue` escape hatch and callers got no more type safety than a hand-written cast. When the invocation is `db.index.fulltext.queryNodes` and the index name is a string literal, `extendEnvFromQueryCall` now looks it up in the schema's `fullTextIndexes` (see the paired `@evryg/effect-neo4j-schema` release) and binds the yielded node to `VertexType` for a single covered label or `VertexUnionType` for several, so property access infers real types through the existing union rule. A small static table also types `score` (and the equivalent yield from `db.index.fulltext.queryRelationships` and `db.index.vector.queryNodes`) as a numeric scalar even without a schema hit. The lookup is a name lookup against a string literal, not general procedure-signature inference: only these three builtin procedures are affected, their YIELD variables move from `UnknownType` to a precise type, and no other query's inferred type changes.
