---
"@evryg/effect-neo4j-schema": patch
---

Merge `fullTextIndex` annotations that share the same index name into a single Cypher statement, and
reject them at compile time when their field lists disagree.

Neo4j fulltext index names are store-global, so when two schemas declared `fullTextIndex` with the same
`name`, `compileToCypherDDL` emitted one single-label `CREATE FULLTEXT INDEX <name> ... FOR (n:Label) ...`
statement per schema — two conflicting `CREATE` statements for the same name in one DDL script, which
Neo4j rejects on the second ("already exists an index called ..."), since `IF NOT EXISTS` keys on the
name alone rather than the label set. Schemas sharing an index name are now grouped and compiled into a
single statement per name, with labels joined `Label1|Label2` in first-seen order, matching Neo4j's
native multi-label fulltext index syntax. An index name declared by only one schema still compiles to
byte-identical DDL.

Neo4j has no per-label scoping of `ON EACH`: a node is indexed once it carries at least one of the
statement's labels and at least one of its properties, so a per-schema field list cannot be preserved
across a label merge. Earlier, merging same-named annotations with different field lists unioned the
fields, which silently widened what each schema's index actually covers — for example a `Book` index on
`title`/`summary` merged with an `Author` index on `name` would also match `Book` nodes on `name` and
`Author` nodes on `title`/`summary`. `compileToCypherDDL` now throws when same-named `fullTextIndex`
annotations declare different field lists, naming the index and the conflicting label; give same-named
indexes identical field lists, or use distinct names.
