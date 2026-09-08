---
"@evryg/effect-neo4j-schema": patch
---

Merge `fullTextIndex` annotations that share the same index name into a single Cypher statement.

Neo4j fulltext index names are store-global, so when two schemas declared `fullTextIndex` with the same
`name`, `compileToCypherDDL` emitted one single-label `CREATE FULLTEXT INDEX <name> ... FOR (n:Label) ...`
statement per schema — two conflicting `CREATE` statements for the same name in one DDL script, which
Neo4j rejects on the second ("already exists an index called ..."), since `IF NOT EXISTS` keys on the
name alone rather than the label set. Schemas sharing an index name are now grouped and compiled into a
single statement per name, with labels joined `Label1|Label2` in first-seen order and fields deduplicated
across schemas, also in first-seen order — matching Neo4j's native multi-label fulltext index syntax. An
index name declared by only one schema still compiles to byte-identical DDL.
