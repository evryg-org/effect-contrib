---
"@evryg/effect-vitest-neo4j": minor
---

Add `CleanNeo4jSchema`, a scoped test resource that leaves a Neo4j database with no constraints and no indexes.

It drops every constraint and every non-LOOKUP index on acquire and again on release, so schema objects created by a test do not leak into the next one. `CleanNeo4jGraph` only deletes nodes and relationships and leaves the schema in place.
