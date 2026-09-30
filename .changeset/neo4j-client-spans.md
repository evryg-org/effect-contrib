---
"@evryg/effect-neo4j": minor
---

Emit OpenTelemetry-conventional client spans from `Neo4jClient`.

`query`, `runBatch` and `queryStream` now run inside the client spans `neo4j.query`, `neo4j.run_batch` and `neo4j.query_stream`. Each span carries `db.system.name` (`neo4j`), `db.namespace` (the configured database), `db.query.text` (the Cypher) and `db.operation.name` (the Cypher's first keyword, upper-cased). `neo4j.run_batch` also carries `db.operation.batch.size`. The stream span stays open for the whole stream consumption, and a failing query marks its span failed. Query parameters and batch rows are never recorded as attributes. Without a tracer the spans are no-ops.
