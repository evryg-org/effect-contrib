---
"@evryg/effect-cypher-codegen": patch
---

Make generated query code type-check under Effect v4.

- Row decoding no longer emits an untyped `Neo4jRecordToObject` schema transform.
  `record.toObject()` is called in the Effect pipeline and each row is validated
  directly with `Schema.Array(Row)`, so the row struct fully type-checks the
  decoded shape.
- The generated `TemporalString` transform now carries explicit
  `SchemaTransformation.transform<string, unknown>` type parameters, matching its
  `Schema.Unknown` source so it satisfies `decodeTo`'s getter signature.
- Single-file modules now annotate query parameters with their types instead of
  relying on an implicit `any`, the same way the barrel output already did.
