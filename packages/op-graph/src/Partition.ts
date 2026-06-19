import { Match } from "effect"
import { GraphOp, InsertVertex, UpsertEdge, UpsertVertex, VertexRef } from "./GraphOp.js"

/**
 * Extra identity fields a vertex carries for its partition. Part of the vertex's MERGE key, so two
 * vertices in different partitions are distinct nodes even with the same natural key.
 */
export type PartitionKey = Record<string, string>

/**
 * A partition policy: the partition key for a given vertex label. The caller decides which partitions
 * exist and which label lives in which — uniform (one partition for all labels) or per-label. The single
 * seam through which vertex identity is partitioned.
 */
export type PartitionKeyFor = (label: string) => PartitionKey

/**
 * Stamp each VERTEX identity with the partition key chosen for ITS OWN label — `UpsertVertex`/
 * `InsertVertex.key` and BOTH endpoint refs of an `UpsertEdge`. The edge's own key is untouched (an
 * edge is identified by its partitioned endpoints plus its discriminating key).
 *
 * Keying each endpoint by its own label is what makes a cross-partition edge correct: when the two
 * endpoints belong to different partitions, each is matched in its own, so the edge connects the nodes
 * that already exist rather than minting partition-local duplicates.
 */
export const enrichVertexKeysBy = (partitionKeyFor: PartitionKeyFor) =>
  (op: GraphOp): GraphOp =>
    Match.valueTags(op, {
      UpsertVertex: (v) =>
        new UpsertVertex({ label: v.label, key: { ...v.key, ...partitionKeyFor(v.label) }, properties: v.properties }),
      InsertVertex: (v) =>
        new InsertVertex({ label: v.label, key: { ...v.key, ...partitionKeyFor(v.label) }, properties: v.properties }),
      UpsertEdge: (e) =>
        new UpsertEdge({
          label: e.label,
          from: new VertexRef({ label: e.from.label, key: { ...e.from.key, ...partitionKeyFor(e.from.label) } }),
          to: new VertexRef({ label: e.to.label, key: { ...e.to.key, ...partitionKeyFor(e.to.label) } }),
          key: e.key,
          properties: e.properties,
        }),
    })
