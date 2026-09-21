import { Match } from "effect"
import { GraphOp, UpsertVertex } from "./GraphOp.js"

/**
 * Extra properties a vertex carries as attribution — who or what produced it. NOT part of the MERGE
 * key, which is the whole difference from a {@link PartitionKey}: attribution says where a node came
 * from without saying which node it is, so re-attributing never mints a second node.
 */
// A generic Neo4j property bag spread-merged with a vertex's own properties and reduced across
// labels via Record.makeReducerUnion — the record IS the domain here.
// ast-grep-ignore: typescript/no-exported-collection-alias
export type VertexAttribution = Record<string, string>

/**
 * An attribution policy: the attribution a given vertex label carries. An empty record means the
 * label is attributed nothing, which is how a policy declines a label rather than inventing one.
 */
export type VertexAttributionFor = (label: string) => VertexAttribution

/**
 * Attribute each VERTEX with what its OWN label is attributed, leaving identity untouched. The
 * policy is applied last, so it overrides a property of the same name the op already carried.
 *
 * Edges are left alone: an `UpsertEdge`'s endpoints are refs carrying identity only, so there is no
 * vertex there to attribute — the endpoint's own `UpsertVertex` is where its attribution lands.
 */
export const enrichVertexPropertiesBy = (attributionFor: VertexAttributionFor) =>
  (op: GraphOp): GraphOp =>
    Match.valueTags(op, {
      UpsertVertex: (v) =>
        new UpsertVertex({
          label: v.label,
          key: v.key,
          properties: { ...v.properties, ...attributionFor(v.label) },
        }),
      UpsertEdge: (e): GraphOp => e,
    })
