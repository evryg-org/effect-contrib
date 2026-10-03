import { describe, expect, it } from "@effect/vitest"
import { Result, Schema } from "effect"
import { assembleGraphSchema } from "./AssembledGraphSchema.js"
import { AnnotatedGraphSchemas, GraphSchemaContribution } from "./GraphSchemaContribution.js"
import { ContributingModule } from "./GraphVocabulary.js"
import { neo4jEdge, neo4jIndexed, neo4jUnique, neo4jVertex } from "./Neo4jSchemaAnnotations.js"

const PersonVertex = Schema.Struct({
  id: Schema.String.annotate(neo4jUnique),
  name: Schema.String,
  age: Schema.optional(Schema.Number),
  active: Schema.optional(Schema.Boolean),
  tags: Schema.Array(Schema.String),
  file: Schema.optional(Schema.String).annotate(neo4jIndexed)
}).annotate(neo4jVertex("Person"))

const ServerVertex = Schema.Struct({
  listenPort: Schema.Number,
  serverName: Schema.String
}).annotate(neo4jVertex("Server", {
  compositeKey: ["listenPort", "serverName"]
}))

const IndexedVertex = Schema.Struct({
  id: Schema.String.annotate(neo4jUnique),
  name: Schema.String
}).annotate(neo4jVertex("Indexed", {
  compositeIndexes: [["id", "name"]],
  fullTextIndexes: [{ name: "indexed_search", fields: ["id", "name"] }]
}))

const ddlOf = (...members: ReadonlyArray<Schema.Struct<Schema.Struct.Fields>>): string =>
  Result.getOrThrow(
    assembleGraphSchema([
      new GraphSchemaContribution({
        owner: ContributingModule.make("examples"),
        schemas: new AnnotatedGraphSchemas({ members })
      })
    ])
  ).ddl()

describe("the DDL of an assembled graph schema", () => {
  it("generates UNIQUE constraint for neo4jUnique field", () => {
    expect(ddlOf(PersonVertex)).toContain("CREATE CONSTRAINT IF NOT EXISTS FOR (n:Person) REQUIRE n.id IS UNIQUE;")
  })

  it("generates INDEX for neo4jIndexed field", () => {
    expect(ddlOf(PersonVertex)).toContain("CREATE INDEX IF NOT EXISTS FOR (n:Person) ON (n.file);")
  })

  it("generates composite UNIQUE constraint for compositeKey", () => {
    expect(ddlOf(ServerVertex)).toContain(
      "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Server) REQUIRE (n.listenPort, n.serverName) IS UNIQUE;"
    )
  })

  it("generates composite INDEX for compositeIndexes", () => {
    expect(ddlOf(IndexedVertex)).toContain("CREATE INDEX IF NOT EXISTS FOR (n:Indexed) ON (n.id, n.name);")
  })

  it("generates FULLTEXT INDEX for fullTextIndexes", () => {
    expect(ddlOf(IndexedVertex)).toContain(
      "CREATE FULLTEXT INDEX indexed_search IF NOT EXISTS FOR (n:Indexed) ON EACH [n.id, n.name];"
    )
  })

  it("does not generate DDL for edge schemas", () => {
    const KnowsEdge = Schema.Struct({
      since: Schema.Number,
      weight: Schema.optional(Schema.Number)
    }).annotate(neo4jEdge("KNOWS", [{ from: PersonVertex, to: PersonVertex }]))
    expect(ddlOf(KnowsEdge)).toBe("")
  })

  it("merges same-named fullTextIndexes entries across schemas into one statement", () => {
    const BookVertex = Schema.Struct({
      title: Schema.String,
      summary: Schema.optional(Schema.String)
    }).annotate(neo4jVertex("Book", {
      fullTextIndexes: [{ name: "content_search", fields: ["title", "summary"] }]
    }))

    const AuthorVertex = Schema.Struct({
      title: Schema.String,
      summary: Schema.optional(Schema.String)
    }).annotate(neo4jVertex("Author", {
      fullTextIndexes: [{ name: "content_search", fields: ["title", "summary"] }]
    }))

    const contentSearchLines = ddlOf(BookVertex, AuthorVertex).split("\n").filter((line) =>
      line.includes("content_search")
    )
    expect(contentSearchLines).toEqual([
      "CREATE FULLTEXT INDEX content_search IF NOT EXISTS FOR (n:Book|Author) ON EACH [n.title, n.summary];"
    ])
  })

  it("generates one FULLTEXT INDEX per entry when a vertex declares multiple fullTextIndexes", () => {
    const BookVertex = Schema.Struct({
      title: Schema.String,
      summary: Schema.optional(Schema.String)
    }).annotate(neo4jVertex("Book", {
      fullTextIndexes: [
        { name: "title_search", fields: ["title"] },
        { name: "content_search", fields: ["title", "summary"] }
      ]
    }))

    const fullTextLines = ddlOf(BookVertex).split("\n").filter((line) => line.includes("FULLTEXT"))
    expect(fullTextLines).toEqual([
      "CREATE FULLTEXT INDEX title_search IF NOT EXISTS FOR (n:Book) ON EACH [n.title];",
      "CREATE FULLTEXT INDEX content_search IF NOT EXISTS FOR (n:Book) ON EACH [n.title, n.summary];"
    ])
  })
})
