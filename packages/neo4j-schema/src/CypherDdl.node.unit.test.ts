import { describe, expect, it } from "@effect/vitest"
import { Result, Schema } from "effect"
import { AnnotatedGraphSchemas, GraphSchemaContribution } from "./GraphSchemaContribution.js"
import { ContributingModule, FullTextIndexName, PropertyName, PropertyNames } from "./GraphVocabulary.js"
import { neo4jUnique, neo4jVertex } from "./Neo4jSchemaAnnotations.js"
import { compileToCypherDDL } from "./Neo4jSchemaDDL.js"
import { SchemaConflict } from "./SchemaConflict.js"

const ddlOf = (contributions: ReadonlyArray<GraphSchemaContribution>): Result.Result<string, unknown> =>
  Result.try(() => compileToCypherDDL(contributions.flatMap((contribution) => [...contribution.schemas.members])))

const contribution = (owner: string, ...members: ReadonlyArray<Schema.Struct<Schema.Struct.Fields>>) =>
  new GraphSchemaContribution({
    owner: ContributingModule.make(owner),
    schemas: new AnnotatedGraphSchemas({ members })
  })

const searchable = (label: string, key: string, fields: ReadonlyArray<string>) =>
  Schema.Struct({
    [key]: Schema.String.annotate(neo4jUnique),
    title: Schema.String,
    summary: Schema.optional(Schema.String),
    name: Schema.optional(Schema.String)
  }).annotate(neo4jVertex(label, { fullTextIndexes: [{ name: "content_search", fields: [...fields] }] }))

describe("the Cypher DDL of contributions", () => {
  const books = contribution("catalog/books", searchable("Book", "isbn", ["title", "summary"]))
  const authors = contribution("catalog/authors", searchable("Author", "orcid", ["title", "summary"]))

  it("does not depend on the order the contributions arrive in", () => {
    expect(ddlOf([books, authors])).toEqual(ddlOf([authors, books]))
  })

  it("refuses a fulltext index declared over differing fields with a typed SchemaConflict, whatever the order", () => {
    const named = contribution("catalog/authors", searchable("Author", "orcid", ["name"]))
    const conflict = Result.fail(SchemaConflict.cases.ConflictingFullTextFields.make({
      index: FullTextIndexName.make("content_search"),
      fields: new PropertyNames({ members: [PropertyName.make("name")] }),
      conflictingFields: new PropertyNames({ members: [PropertyName.make("title"), PropertyName.make("summary")] })
    }))
    expect(ddlOf([books, named])).toEqual(conflict)
    expect(ddlOf([named, books])).toEqual(conflict)
  })
})
