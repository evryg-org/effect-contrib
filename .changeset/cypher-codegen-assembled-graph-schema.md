---
"@evryg/effect-cypher-codegen": minor
---

`runCodegenCli` takes an assembled graph schema instead of a list of schemas: `runCodegenCli(schema: AssembledGraphSchema)`.

`apply-schema` now applies the canonical DDL of the assembled schema (`schema.ddlModel().statements()`), which does not depend on the order the schemas were declared in. It used `compileToCypherDDL`, which `@evryg/effect-neo4j-schema` no longer exports. `generate annotations` reads the same assembled schema (`schema.graphSchema()`), so both subcommands work from one source, and a conflict between schemas surfaces as a typed `SchemaConflict` when you assemble them, before the CLI runs.

To migrate, assemble the schemas first:

```ts
const schema = Result.getOrThrow(
  assembleGraphSchema([
    new GraphSchemaContribution({
      owner: ContributingModule.make("app"),
      schemas: new AnnotatedGraphSchemas({ members: allSchemas })
    })
  ])
)
runCodegenCli(schema)
```
