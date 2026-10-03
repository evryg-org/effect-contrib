import { describe, expect, it } from "@effect/vitest"
import { checkGraphOp, UndeclaredProperty, UpsertEdge, VertexRef } from "@evryg/effect-op-graph"
import { Array, Function, HashMap, Option, Result, Schema } from "effect"
import { assembleGraphSchema } from "./AssembledGraphSchema.js"
import { EdgeEnds, EdgeSlot } from "./EdgeSlot.js"
import { AnnotatedGraphSchemas, GraphSchemaContribution } from "./GraphSchemaContribution.js"
import { EdgeConnectivity, EdgeProperty } from "./GraphSchemaModel.js"
import {
  ContributingModule,
  ContributingModules,
  EdgeType,
  FullTextIndexName,
  PropertyName,
  PropertyNames,
  VertexLabel
} from "./GraphVocabulary.js"
import { GraphWriters } from "./GraphWriters.js"
import { neo4jEdge, neo4jIndexed, neo4jVertex } from "./Neo4jSchemaAnnotations.js"
import { SchemaConflict } from "./SchemaConflict.js"

const vertex = (label: string, fullText: ReadonlyArray<string> = []) =>
  Schema.Struct({ id: Schema.String.annotate(neo4jIndexed), name: Schema.String }).annotate(
    neo4jVertex(label, {
      compositeKey: ["id"],
      fullTextIndexes: Array.match(fullText, {
        onEmpty: () => [],
        onNonEmpty: (fields) => [{ name: "synthetic_search", fields: [...fields] }]
      })
    })
  )

const edge = (edgeType: string, fields: Schema.Struct.Fields, pairs: ReadonlyArray<readonly [string, string]>) =>
  Schema.Struct(fields).annotate(
    neo4jEdge(edgeType, pairs.map(([from, to]) => ({ from: vertex(from), to: vertex(to) })))
  )

const contribution = (owner: string, ...members: ReadonlyArray<Schema.Struct<Schema.Struct.Fields>>) =>
  new GraphSchemaContribution({
    owner: ContributingModule.make(owner),
    schemas: new AnnotatedGraphSchemas({ members })
  })

const conflictOf = (contributions: ReadonlyArray<GraphSchemaContribution>) =>
  Result.match(assembleGraphSchema(contributions), { onFailure: Option.some, onSuccess: () => Option.none() })

const propertyNames = (...names: ReadonlyArray<string>) =>
  new PropertyNames({ members: names.map((name) => PropertyName.make(name)) })

const owners = (...modules: ReadonlyArray<string>) =>
  ContributingModules.of(modules.map((module) => ContributingModule.make(module)))

const slot = (edgeType: string, from: string, to: string) =>
  new EdgeSlot({
    edgeType: EdgeType.make(edgeType),
    ends: new EdgeEnds({ from: VertexLabel.make(from), to: VertexLabel.make(to) })
  })

describe("assembleGraphSchema", () => {
  it("refuses a vertex label two modules declare, naming both", () => {
    expect(
      conflictOf([contribution("synthetic/beta", vertex("Alpha")), contribution("synthetic/alpha", vertex("Alpha"))])
    )
      .toEqual(
        Option.some(
          SchemaConflict.cases.DuplicateVertexLabel.make({
            label: VertexLabel.make("Alpha"),
            owners: owners("synthetic/alpha", "synthetic/beta")
          })
        )
      )
  })

  it("refuses one module declaring a vertex label at two positions, since each position is a declaration", () => {
    expect(conflictOf([
      contribution("synthetic/alpha", vertex("Alpha"), vertex("Beta")),
      contribution("synthetic/alpha", vertex("Beta"))
    ])).toEqual(
      Option.some(
        SchemaConflict.cases.DuplicateVertexLabel.make({
          label: VertexLabel.make("Beta"),
          owners: owners("synthetic/alpha")
        })
      )
    )
  })

  it("accepts the very same contribution twice", () => {
    const once = [contribution("synthetic/alpha", vertex("Alpha"), vertex("Beta"))]
    expect(assembleGraphSchema([...once, ...once])).toEqual(assembleGraphSchema(once))
  })

  it("refuses one endpoint pair two modules declare with identical fields, naming both", () => {
    const conflict = conflictOf([
      contribution("synthetic/beta", edge("LINKS", { weight: Schema.Number }, [["Alpha", "Beta"]])),
      contribution("synthetic/alpha", edge("LINKS", { weight: Schema.Number }, [["Alpha", "Beta"]]))
    ])
    expect(conflict).toEqual(Option.some(SchemaConflict.cases.SharedEdgeSlot.make({
      edgeType: EdgeType.make("LINKS"),
      ends: new EdgeEnds({ from: VertexLabel.make("Alpha"), to: VertexLabel.make("Beta") }),
      owners: owners("synthetic/alpha", "synthetic/beta")
    })))
  })

  it("refuses one endpoint pair two modules declare with differing fields as shared, not as a field conflict", () => {
    const conflict = conflictOf([
      contribution("synthetic/alpha", edge("LINKS", { weight: Schema.Number }, [["Alpha", "Beta"]])),
      contribution(
        "synthetic/beta",
        edge("LINKS", { weight: Schema.Number, note: Schema.optional(Schema.String) }, [["Alpha", "Beta"]])
      )
    ])
    expect(conflict).toEqual(Option.some(SchemaConflict.cases.SharedEdgeSlot.make({
      edgeType: EdgeType.make("LINKS"),
      ends: new EdgeEnds({ from: VertexLabel.make("Alpha"), to: VertexLabel.make("Beta") }),
      owners: owners("synthetic/alpha", "synthetic/beta")
    })))
  })

  it("refuses one module declaring one endpoint pair with differing fields, naming it", () => {
    const conflict = conflictOf([
      contribution("synthetic/alpha", edge("LINKS", { weight: Schema.Number }, [["Alpha", "Beta"]])),
      contribution(
        "synthetic/alpha",
        edge("LINKS", { weight: Schema.Number, note: Schema.optional(Schema.String) }, [["Alpha", "Beta"]])
      )
    ])
    expect(conflict).toEqual(Option.some(SchemaConflict.cases.ConflictingEdgeFields.make({
      edgeType: EdgeType.make("LINKS"),
      ends: new EdgeEnds({ from: VertexLabel.make("Alpha"), to: VertexLabel.make("Beta") }),
      owner: ContributingModule.make("synthetic/alpha")
    })))
  })

  it("refuses a fulltext index declared over differing fields", () => {
    const conflict = conflictOf([
      contribution("synthetic/alpha", vertex("Alpha", ["name"])),
      contribution("synthetic/beta", vertex("Beta", ["id", "name"]))
    ])
    expect(conflict).toEqual(Option.some(SchemaConflict.cases.ConflictingFullTextFields.make({
      index: FullTextIndexName.make("synthetic_search"),
      fields: propertyNames("id", "name"),
      conflictingFields: propertyNames("name")
    })))
  })

  it("refuses an edge property whose Neo4j type differs from one endpoint pair to another", () => {
    const conflict = conflictOf([
      contribution("synthetic/alpha", edge("LINKS", { weight: Schema.Number }, [["Alpha", "Beta"]])),
      contribution("synthetic/beta", edge("LINKS", { weight: Schema.String }, [["Beta", "Alpha"]]))
    ])
    expect(conflict).toEqual(Option.some(SchemaConflict.cases.ConflictingEdgePropertyTypes.make({
      edgeType: EdgeType.make("LINKS"),
      property: PropertyName.make("weight"),
      owners: owners("synthetic/alpha", "synthetic/beta")
    })))
  })

  it("accepts two modules declaring distinct endpoint pairs of one edge type", () => {
    const assembled = assembleGraphSchema([
      contribution("synthetic/alpha", edge("LINKS", {}, [["Alpha", "Beta"]])),
      contribution("synthetic/beta", edge("LINKS", {}, [["Beta", "Beta"]]))
    ])
    expect(Result.map(assembled, (schema) => schema.graphSchema().edgeConnectivity)).toEqual(Result.succeed([
      new EdgeConnectivity({ edgeType: "LINKS", fromLabel: "Alpha", toLabel: "Beta" }),
      new EdgeConnectivity({ edgeType: "LINKS", fromLabel: "Beta", toLabel: "Beta" })
    ]))
  })
})

describe("the assembled schema's projections", () => {
  const perPair = () =>
    Result.getOrThrow(assembleGraphSchema([
      contribution(
        "synthetic/alpha",
        vertex("Alpha"),
        vertex("Beta"),
        edge("LINKS", { weight: Schema.Number }, [["Alpha", "Beta"]])
      ),
      contribution(
        "synthetic/beta",
        edge("LINKS", { weight: Schema.Number, note: Schema.optional(Schema.String), rank: Schema.Number }, [[
          "Beta",
          "Alpha"
        ]])
      )
    ]))

  it("joins an edge type's fields per property for the graph schema model: mandatory only where every pair requires it", () => {
    expect(perPair().graphSchema().edgeProperties).toEqual([
      new EdgeProperty({
        edgeType: "LINKS",
        propertyName: "note",
        propertyTypes: ["STRING NOT NULL"],
        mandatory: false
      }),
      new EdgeProperty({
        edgeType: "LINKS",
        propertyName: "rank",
        propertyTypes: ["FLOAT NOT NULL"],
        mandatory: false
      }),
      new EdgeProperty({
        edgeType: "LINKS",
        propertyName: "weight",
        propertyTypes: ["FLOAT NOT NULL"],
        mandatory: true
      })
    ])
  })

  it("joins a property every pair declares as optional when one pair leaves it optional", () => {
    const joined = Result.getOrThrow(assembleGraphSchema([
      contribution("synthetic/alpha", edge("LINKS", { note: Schema.String }, [["Alpha", "Beta"]])),
      contribution("synthetic/beta", edge("LINKS", { note: Schema.optional(Schema.String) }, [["Beta", "Alpha"]]))
    ]))
    expect(joined.graphSchema().edgeProperties).toEqual([
      new EdgeProperty({
        edgeType: "LINKS",
        propertyName: "note",
        propertyTypes: ["STRING NOT NULL"],
        mandatory: false
      })
    ])
  })

  it("widens a literal edge property to its carrier type for the graph schema model", () => {
    const widened = Result.getOrThrow(assembleGraphSchema([
      contribution("synthetic/alpha", edge("LINKS", { kind: Schema.Literal("strong") }, [["Alpha", "Beta"]]))
    ]))
    expect(widened.graphSchema().edgeProperties).toEqual([
      new EdgeProperty({ edgeType: "LINKS", propertyName: "kind", propertyTypes: ["STRING NOT NULL"], mandatory: true })
    ])
  })

  it("records the one writer of each vertex label and edge slot: the module declaring it", () => {
    const alpha = ContributingModule.make("synthetic/alpha")
    expect(perPair().writers()).toEqual(GraphWriters.of(
      HashMap.make([VertexLabel.make("Alpha"), alpha], [VertexLabel.make("Beta"), alpha]),
      HashMap.make([slot("LINKS", "Alpha", "Beta"), alpha], [
        slot("LINKS", "Beta", "Alpha"),
        ContributingModule.make("synthetic/beta")
      ])
    ))
  })

  it("checks an edge write against the fields of its own endpoint pair", () => {
    const write = new UpsertEdge({
      label: "LINKS",
      from: new VertexRef({ label: "Alpha", key: { id: "a" } }),
      to: new VertexRef({ label: "Beta", key: { id: "b" } }),
      key: {},
      properties: { weight: 1, rank: 2 }
    })
    const reason = Result.match(checkGraphOp(perPair().declarationIndex())(write), {
      onFailure: (violation) => Option.some(violation.reason),
      onSuccess: Function.constant(Option.none())
    })
    expect(reason).toEqual(Option.some(new UndeclaredProperty({ property: "rank" })))
  })

  it("renders a fulltext index once for a vertex that declares it twice", () => {
    const twice = Schema.Struct({ name: Schema.String }).annotate(neo4jVertex("Alpha", {
      fullTextIndexes: [{ name: "synthetic_search", fields: ["name"] }, { name: "synthetic_search", fields: ["name"] }]
    }))
    expect(Result.getOrThrow(assembleGraphSchema([contribution("synthetic/alpha", twice)])).ddl().split("\n")).toEqual([
      "CREATE FULLTEXT INDEX synthetic_search IF NOT EXISTS FOR (n:Alpha) ON EACH [n.name];"
    ])
  })

  it("renders one fulltext statement per index, over its labels in declaration order, after its first label", () => {
    const ddl = Result.getOrThrow(assembleGraphSchema([
      contribution("synthetic/beta", vertex("Gamma", ["name"])),
      contribution("synthetic/alpha", vertex("Beta", ["name"]), vertex("Alpha", ["name"]))
    ])).ddl()
    expect(ddl.split("\n")).toEqual([
      "CREATE INDEX IF NOT EXISTS FOR (n:Beta) ON (n.id);",
      "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Beta) REQUIRE (n.id) IS UNIQUE;",
      "CREATE FULLTEXT INDEX synthetic_search IF NOT EXISTS FOR (n:Beta|Alpha|Gamma) ON EACH [n.name];",
      "CREATE INDEX IF NOT EXISTS FOR (n:Alpha) ON (n.id);",
      "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Alpha) REQUIRE (n.id) IS UNIQUE;",
      "CREATE INDEX IF NOT EXISTS FOR (n:Gamma) ON (n.id);",
      "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Gamma) REQUIRE (n.id) IS UNIQUE;"
    ])
  })
})

describe("the conflict an assembly reports among several", () => {
  const ends = (from: string, to: string) => new EdgeEnds({ from: VertexLabel.make(from), to: VertexLabel.make(to) })

  it("is the least duplicated vertex label, not the first to arrive", () => {
    const both = (owner: string) => contribution(owner, vertex("Beta"), vertex("Alpha"))
    expect(conflictOf([both("synthetic/alpha"), both("synthetic/beta")])).toEqual(Option.some(
      SchemaConflict.cases.DuplicateVertexLabel.make({
        label: VertexLabel.make("Alpha"),
        owners: owners("synthetic/alpha", "synthetic/beta")
      })
    ))
  })

  it("is the least shared edge slot, not the first to arrive", () => {
    const both = (owner: string) => contribution(owner, edge("LINKS", {}, [["Beta", "Alpha"], ["Alpha", "Beta"]]))
    expect(conflictOf([both("synthetic/alpha"), both("synthetic/beta")])).toEqual(Option.some(
      SchemaConflict.cases.SharedEdgeSlot.make({
        edgeType: EdgeType.make("LINKS"),
        ends: ends("Alpha", "Beta"),
        owners: owners("synthetic/alpha", "synthetic/beta")
      })
    ))
  })

  it("is the least edge slot one module declares with differing fields, not the first to arrive", () => {
    const pairs: ReadonlyArray<readonly [string, string]> = [["Beta", "Alpha"], ["Alpha", "Beta"]]
    expect(conflictOf([
      contribution(
        "synthetic/alpha",
        edge("LINKS", { weight: Schema.Number }, pairs),
        edge("LINKS", { note: Schema.String }, pairs)
      )
    ])).toEqual(Option.some(
      SchemaConflict.cases.ConflictingEdgeFields.make({
        edgeType: EdgeType.make("LINKS"),
        ends: ends("Alpha", "Beta"),
        owner: ContributingModule.make("synthetic/alpha")
      })
    ))
  })

  it("is the least fulltext index declared over differing fields, not the first to arrive", () => {
    const indexed = (label: string, search: ReadonlyArray<string>, path: ReadonlyArray<string>) =>
      Schema.Struct({ id: Schema.String, name: Schema.String }).annotate(neo4jVertex(label, {
        compositeKey: ["id"],
        fullTextIndexes: [{ name: "synthetic_search", fields: [...search] }, {
          name: "synthetic_path",
          fields: [...path]
        }]
      }))
    expect(
      conflictOf([
        contribution("synthetic/alpha", indexed("Alpha", ["name"], ["id"]), indexed("Beta", ["id"], ["name"]))
      ])
    )
      .toEqual(Option.some(
        SchemaConflict.cases.ConflictingFullTextFields.make({
          index: FullTextIndexName.make("synthetic_path"),
          fields: propertyNames("id"),
          conflictingFields: propertyNames("name")
        })
      ))
  })

  it("is the least edge type whose property types differ across pairs, not the first to arrive", () => {
    const typed = (owner: string, weight: Schema.Top, pair: readonly [string, string]) =>
      contribution(owner, edge("OWNS", { weight }, [pair]), edge("LINKS", { weight }, [pair]))
    expect(
      conflictOf([
        typed("synthetic/alpha", Schema.Number, ["Alpha", "Beta"]),
        typed("synthetic/beta", Schema.String, ["Beta", "Alpha"])
      ])
    ).toEqual(
      Option.some(SchemaConflict.cases.ConflictingEdgePropertyTypes.make({
        edgeType: EdgeType.make("LINKS"),
        property: PropertyName.make("weight"),
        owners: owners("synthetic/alpha", "synthetic/beta")
      }))
    )
  })
})
