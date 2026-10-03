import { Match, Result } from "effect"
import type { GraphOp } from "./GraphOp.js"
import { UpsertEdge, UpsertVertex, VertexRef } from "./GraphOp.js"

/**
 * Extra identity fields a vertex carries for its partition. Part of the vertex's MERGE key, so two
 * vertices in different partitions are distinct nodes even with the same natural key.
 */
// Spread-merged into a vertex/edge-endpoint's own MERGE key; callers project their own richer
// partition key down to this generic bag before it reaches this library.
export type PartitionKey = Record<string, string>

/**
 * A partition policy: the partition key for a given vertex label. The caller decides which partitions
 * exist and which label lives in which — uniform (one partition for all labels) or per-label. The single
 * seam through which vertex identity is partitioned.
 */
export type PartitionKeyFor = (label: string) => PartitionKey

/**
 * {@link enrichVertexKeysBy} under a policy that may refuse a label: the first refused label (the
 * vertex's, else the edge's `from`, else its `to`) fails the whole op with the policy's own failure.
 */
export const enrichVertexKeysByResult =
  <E>(partitionKeyFor: (label: string) => Result.Result<PartitionKey, E>) => (op: GraphOp): Result.Result<GraphOp, E> =>
    Match.valueTags(op, {
      UpsertVertex: (v): Result.Result<GraphOp, E> =>
        Result.map(
          partitionKeyFor(v.label),
          (partition) => new UpsertVertex({ label: v.label, key: { ...v.key, ...partition }, properties: v.properties })
        ),
      UpsertEdge: (e): Result.Result<GraphOp, E> =>
        Result.map(
          Result.all([partitionKeyFor(e.from.label), partitionKeyFor(e.to.label)]),
          ([fromPartition, toPartition]) =>
            new UpsertEdge({
              label: e.label,
              from: new VertexRef({ label: e.from.label, key: { ...e.from.key, ...fromPartition } }),
              to: new VertexRef({ label: e.to.label, key: { ...e.to.key, ...toPartition } }),
              key: e.key,
              properties: e.properties
            })
        )
    })

/**
 * Stamp each VERTEX identity with the partition key chosen for ITS OWN label — `UpsertVertex.key`
 * and BOTH endpoint refs of an `UpsertEdge`. The edge's own key is untouched (an edge is identified
 * by its partitioned endpoints plus its discriminating key).
 *
 * Keying each endpoint by its own label is what makes a cross-partition edge correct: when the two
 * endpoints belong to different partitions, each is matched in its own, so the edge connects the nodes
 * that already exist rather than minting partition-local duplicates.
 */
export const enrichVertexKeysBy = (partitionKeyFor: PartitionKeyFor) => (op: GraphOp): GraphOp =>
  Result.merge(enrichVertexKeysByResult((label) => Result.succeed(partitionKeyFor(label)))(op))
