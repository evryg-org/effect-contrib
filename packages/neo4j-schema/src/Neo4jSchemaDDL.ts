/**
 * @since 0.0.1
 */
import type { Schema } from "effect"

/**
 * Compile Effect Schema structs with neo4j annotations into Cypher DDL statements
 * @since 0.0.1
 * @category ddl
 */
export function compileToCypherDDL(schemas: Array<Schema.Schema.Any>): string {
  const lines: Array<string> = []

  for (const schema of schemas) {
    const ast = schema.ast
    if (ast._tag !== "TypeLiteral") continue

    const annotations = ast.annotations ?? {}
    const label = annotations.neo4jLabel as string | undefined
    if (!label) continue // Edges don't generate DDL (no constraints on rel types in CE)

    // Field-level constraints
    for (const ps of ast.propertySignatures) {
      const name = String(ps.name)
      // Annotations can be on the type (Schema.String.annotations(...)) or on the property signature (Schema.optional(...).annotations(...))
      const typeAnnotations = ps.type.annotations ?? {}
      const psAnnotations = ps.annotations ?? {}

      if (typeAnnotations.neo4jUnique || psAnnotations.neo4jUnique) {
        lines.push(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.${name} IS UNIQUE;`)
      }
      if (typeAnnotations.neo4jIndex || psAnnotations.neo4jIndex) {
        lines.push(`CREATE INDEX IF NOT EXISTS FOR (n:${label}) ON (n.${name});`)
      }
    }

    // Struct-level constraints
    const compositeKey = annotations.compositeKey as Array<string> | undefined
    if (compositeKey) {
      const fields = compositeKey.map((f) => `n.${f}`).join(", ")
      lines.push(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE (${fields}) IS UNIQUE;`)
    }

    const compositeIndexes = annotations.compositeIndexes as Array<Array<string>> | undefined
    if (compositeIndexes) {
      for (const idx of compositeIndexes) {
        const fields = idx.map((f) => `n.${f}`).join(", ")
        lines.push(`CREATE INDEX IF NOT EXISTS FOR (n:${label}) ON (${fields});`)
      }
    }

    const fullTextIndex = annotations.fullTextIndex as { name: string; fields: Array<string> } | undefined
    if (fullTextIndex) {
      const fields = fullTextIndex.fields.map((f) => `n.${f}`).join(", ")
      lines.push(`CREATE FULLTEXT INDEX ${fullTextIndex.name} IF NOT EXISTS FOR (n:${label}) ON EACH [${fields}];`)
    }
  }

  return lines.join("\n")
}
