# node-effect-cypher

Effect-based Cypher query codegen library. Imports `.cypher` files as typed Effect modules via Node loader hooks or Vite plugin.

## Architecture

- **Grammar**: `grammar/CypherParser.g4` (OpenCypher ANTLR4 grammar) generates `generated-parser/*.ts`
- **QueryAnalyzer**: Walks ANTLR AST to infer column types and extract parameters
- **CypherCodegen**: Generates typed Effect modules from `.cypher` files (single-file `generateModule` or barrel `generateBarrel`)
- **SchemaExtractor**: Reads Neo4j graph schema via `db.schema.nodeTypeProperties()` for property type resolution
- **Register.ts**: Node `registerHooks` loader for `.cypher` imports at runtime
- **VitePlugin.ts**: Vite transform for `.cypher` imports at build time
- **codegen.ts**: CLI (`pnpm codegen:cypher`) with `extract-schema`, `generate`, and `all` subcommands

## How type inference works

1. Parse `.cypher` with ANTLR grammar
2. Walk MATCH clauses to bind variables to node labels
3. Walk WITH/RETURN projections to infer expression types via `CypherType` ADT (recursive: scalar, list, map, node, unknown)
4. Resolve property types from `GraphSchema` (extracted from Neo4j)
5. Emit Effect Schema code: `Neo4jInt` for Long, `Schema.Struct` for maps, `Schema.Array` for lists, `Neo4jValue` for unknown

## Generated output

Each `.cypher` file produces a typed query function:
```ts
export const fooQuery = (params) =>
  Effect.flatMap(Neo4jClient, (neo4j) =>
    Effect.map(neo4j.query(cypher, params), (recs) => recs.map(recordToRow)))
```

Row schemas use `Schema.decodeUnknownSync` with types inferred from the Cypher AST + graph schema.

## Grammar patch

The grammar originates from [antlr/grammars-v4/cypher](https://github.com/antlr/grammars-v4/tree/master/cypher). We patched `multiPartQ` to align with the [OpenCypher spec](https://opencypher.org/resources/):

```diff
 multiPartQ
-    : readingStatement* (updatingStatement* withSt)+ singlePartQ
+    : (readingStatement* updatingStatement* withSt)+ singlePartQ
     ;
```

The upstream grammar incorrectly hoists `readingStatement*` outside the repeating group, preventing MATCH/OPTIONAL MATCH between WITH clauses. The OpenCypher spec allows `ReadingClause` before each WITH in a multi-part query.

## Conventions

- Regenerate parser after grammar changes: `pnpm antlr4ng ...`
- Regenerate queries after schema/analyzer changes: `pnpm codegen:cypher generate`
- `.cypher` filenames must be unique across the project (barrel uses filename as identifier)
- Neo4j schema types (`Neo4jInt`, `Neo4jValue`) come from `@/lib/effect-neo4j`
