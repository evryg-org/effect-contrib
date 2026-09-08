/**
 * @since 0.0.1
 */
import type { Schema } from "effect"

/**
 * Compile Effect Schema structs with neo4j annotations into Cypher DDL statements
 * @since 0.0.1
 * @category ddl
 */
export function compileToCypherDDL(schemas: Array<Schema.Top>): string {
  const lines: Array<string> = []
  const fullTextGroups = new Map<string, { labels: Array<string>; fields: Array<string>; lineIndex: number }>()

  for (const schema of schemas) {
    const ast = schema.ast
    if (ast._tag !== "Objects") continue

    const annotations = ast.annotations ?? {}
    const label = annotations.neo4jLabel as string | undefined
    if (!label) continue // Edges don't generate DDL (no constraints on rel types in CE)

    // Field-level constraints
    for (const ps of ast.propertySignatures) {
      const name = String(ps.name)
      // In v4 field annotations live on the field schema's AST (set via `.annotate(...)`),
      // whether the field is required (e.g. Schema.String) or optional (the UndefinedOr union).
      const typeAnnotations = ps.type.annotations ?? {}

      if (typeAnnotations.neo4jUnique) {
        lines.push(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.${name} IS UNIQUE;`)
      }
      if (typeAnnotations.neo4jIndex) {
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

    // Index names are store-global in Neo4j and ON EACH has no per-label scoping, so
    // same-named annotations merge their labels but must declare identical field lists;
    // a reserved line slot keeps a solo name's output byte-identical.
    const fullTextIndexes = annotations.fullTextIndexes as
      | Array<{ name: string; fields: Array<string> }>
      | undefined
    for (const fullTextIndex of fullTextIndexes ?? []) {
      const group = fullTextGroups.get(fullTextIndex.name)
      if (group) {
        const sameFields = group.fields.length === fullTextIndex.fields.length &&
          group.fields.every((f, i) => f === fullTextIndex.fields[i])
        if (!sameFields) {
          throw new Error(
            `fullTextIndex "${fullTextIndex.name}" declares conflicting field lists: label ` +
              `${label} declares [${fullTextIndex.fields.join(", ")}], but a schema already merged ` +
              `into this index declares [${group.fields.join(", ")}]. Make the field lists identical, ` +
              `or give ${label} a distinct index name.`
          )
        }
        if (!group.labels.includes(label)) group.labels.push(label)
      } else {
        fullTextGroups.set(fullTextIndex.name, {
          labels: [label],
          fields: [...fullTextIndex.fields],
          lineIndex: lines.push("") - 1
        })
      }
    }
  }

  for (const [name, { fields, labels, lineIndex }] of fullTextGroups) {
    const fieldList = fields.map((f) => `n.${f}`).join(", ")
    lines[lineIndex] = `CREATE FULLTEXT INDEX ${name} IF NOT EXISTS FOR (n:${labels.join("|")}) ON EACH [${fieldList}];`
  }

  return lines.join("\n")
}
