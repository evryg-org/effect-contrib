---
"@evryg/effect-neo4j-schema": minor
---

`neo4jVertex`'s `fullTextIndex` option becomes `fullTextIndexes`, an array

A label was previously limited to one fulltext index because `neo4jVertex(label, { fullTextIndex })` took a single `{ name, fields }` object, but Neo4j imposes no such limit: a label may be covered by any number of fulltext indexes, e.g. a narrow index for a single field alongside a broader one spanning several. `fullTextIndex` is replaced by `fullTextIndexes: Array<{ name: string; fields: Array<string> }>`, with no singular alias kept. `compileToCypherDDL` now emits one `CREATE FULLTEXT INDEX` statement per array entry, and the #189 merge-by-name and conflicting-field-list checks apply per entry exactly as before. Migrate `fullTextIndex: { name, fields }` to `fullTextIndexes: [{ name, fields }]`.
