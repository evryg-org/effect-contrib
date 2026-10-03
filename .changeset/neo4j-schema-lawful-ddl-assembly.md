---
"@evryg/effect-neo4j-schema": minor
---

Assemble a graph schema from the contributions of several modules, lawfully, and render its Cypher DDL canonically. `compileToCypherDDL` is removed: assemble the schemas with `assembleGraphSchema` and render `ddl()` (or `ddlModel().statements()`) on the result.

`compileToCypherDDL(schemas)` rendered its input in the order given, so two orderings of the same schemas rendered different DDL: statements moved, and a fulltext index shared by several labels listed them in first-seen order. It also threw an `Error` when two schemas declared one fulltext index over different fields.

A `GraphSchemaContribution` is what one module declares: its owner (a `ContributingModule`) and its vertex and edge schemas (`AnnotatedGraphSchemas`, which refuses an unannotated schema, an edge that names no endpoint pair, and a vertex marker). `assembleGraphSchema(contributions)` returns `Result<AssembledGraphSchema, SchemaConflict>`:

- Assembly is a bounded semilattice under `AssembledGraphSchema.combine`, with `AssembledGraphSchema.empty` as identity. The order contributions arrive in and repeated contributions change neither the schema nor the conflict reported, and a conflict absorbs whatever it is combined with. Property-based law suites state each of these.
- Disagreements are a typed `SchemaConflict`, never a throw: `DuplicateVertexLabel`, `SharedEdgeSlot`, `ConflictingEdgeFields`, `ConflictingFullTextFields`, `ConflictingEdgePropertyTypes` and `ConflictingVertexAnnotations`. When several conflicts exist, the least in a canonical order is reported.
- `ddl()` renders in declaration-rank order: by owner, then by position in the owner's contribution. `ddlModel()` is a homomorphism to `DdlModel.union`, and a sub-assembly's model is the full model restricted to its labels.
- The assembled schema also gives `graphSchema()` (the `GraphSchema` model code generators read), `schemas()`, `labels()`, `writers()` (the one module writing each label and edge slot), `project(read)` (per-label `VertexAnnotations`), and, through `@evryg/effect-op-graph`, `declarationIndex()` and `writeCheck(markers)`. `neo4jVertexMarker(label, key)` references a vertex another module declares.

`@evryg/effect-op-graph` is a new peer dependency.

To migrate, wrap the schemas in one contribution. Within one contribution the rank order is the input order, so the DDL is the same as `compileToCypherDDL` rendered for the same schemas:

```ts
const ddl = Result.map(
  assembleGraphSchema([
    new GraphSchemaContribution({
      owner: ContributingModule.make("app"),
      schemas: new AnnotatedGraphSchemas({ members: schemas })
    })
  ]),
  (schema) => schema.ddl()
)
```
