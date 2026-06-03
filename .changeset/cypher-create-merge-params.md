---
"@evryg/effect-cypher-codegen": minor
---

Support type inference for `CREATE`/`MERGE` mutations and nullable parameters

- Bind `CREATE`/`MERGE` pattern variables into the type environment, so a `RETURN` referencing a created or merged node (e.g. `CREATE (n:Node {...}) RETURN n.id AS id`) resolves its column types from the schema instead of throwing `Unbound variable`. Created/merged nodes are non-nullable.
- Emit `T | null` for parameters bound to optional vertex properties, matching the `NullOr` treatment those properties already get on the `RETURN` side (so callers can pass `null` to clear a property). `IN`-clause params stay non-nullable.
- Infer bare parameter atoms in projections (`RETURN $id AS id`) as a `String` scalar instead of throwing `Unhandled atom expression`.
