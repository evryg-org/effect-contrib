---
"@evryg/effect-testcontainers-neo4j": minor
---

Wait for Neo4j's ports instead of its startup log line.

`makeNeo4jTestContainer` inherited the default readiness check, which follows the container log for `Started.`. Some container runtimes' log drivers (for example podman with journald) can close the log-follow stream early, so startup failed with `Log stream ended and message "Started." was not received` even though Neo4j came up. Readiness now waits for the exposed ports to listen and for the HTTP endpoint on 7474 to answer `200`.

`testcontainers` is now a direct peer and dev dependency.
