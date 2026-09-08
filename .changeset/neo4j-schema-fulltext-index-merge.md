---
"@evryg/effect-neo4j-schema": patch
---

Merge same-named `fullTextIndex` annotations, and reject conflicting field lists

Index names are store-global in Neo4j, so two schemas declaring `fullTextIndex` with the same `name` used to compile to two conflicting `CREATE FULLTEXT INDEX` statements, the second of which Neo4j rejects (`IF NOT EXISTS` keys on the name, not the label set). Same-named annotations now compile to a single `FOR (n:Label1|Label2)` statement, labels in first-seen order; a name declared by one schema still compiles to byte-identical DDL. Because `ON EACH` has no per-label scoping (a node is indexed once it carries at least one of the labels and at least one of the properties), a per-schema field list cannot survive a label merge, so `compileToCypherDDL` now throws when same-named annotations declare different field lists rather than silently widening every participating index. Give them identical field lists, or distinct names.
