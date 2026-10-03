/**
 * @since 0.0.1
 */
import type { GraphOp } from "./GraphOp.js"
import { enrichVertexKeysBy, type PartitionKey } from "./Partition.js"

/**
 * Add the SAME `extra` identity fields to every VERTEX identity in an op stream (both endpoints of an
 * edge included) — the uniform special case of `enrichVertexKeysBy`, one partition for all labels. For a
 * per-label partition, use `enrichVertexKeysBy` directly.
 *
 * @since 0.0.1
 */
export const enrichVertexKeys = (extra: PartitionKey): (op: GraphOp) => GraphOp => enrichVertexKeysBy(() => extra)
