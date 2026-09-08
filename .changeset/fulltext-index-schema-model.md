---
"@evryg/effect-neo4j-schema": minor
---

`compileToGraphSchema` emits `fullTextIndexes`

`GraphSchema` gains a `FullTextIndex` model (`{ name, labels, fields }`) and a `fullTextIndexes` field, templated on `edgeConnectivity`'s decoding default and constructor default so existing constructor calls and cached schema JSON keep decoding unchanged. `compileToGraphSchema` previously dropped the `fullTextIndexes` annotation entirely, leaving consumers with no way to learn which labels a fulltext index covers; it now merges same-named entries across labels the same way `compileToCypherDDL` already does in `Neo4jSchemaDDL.ts`, including the conflicting-field-list error. `LiveDbGraphSchemaResolver` gets this field for free via the constructor default (`[]`) — live-DB introspection of `SHOW FULLTEXT INDEXES` is left for a follow-up.
