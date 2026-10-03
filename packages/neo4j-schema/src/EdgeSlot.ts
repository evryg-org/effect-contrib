/**
 * An edge slot: an edge type with one endpoint pair, the unit one module
 * declares and writes.
 *
 * @since 0.8.0
 */
import { Schema } from "effect"
import { EdgeType, VertexLabel } from "./GraphVocabulary.js"

/**
 * The labels an edge leaves from and arrives at.
 *
 * @since 0.8.0
 * @category models
 */
export class EdgeEnds extends Schema.Class<EdgeEnds>("EdgeEnds")({
  from: VertexLabel,
  to: VertexLabel
}) {}

/**
 * An edge type with one endpoint pair.
 *
 * @since 0.8.0
 * @category models
 */
export class EdgeSlot extends Schema.Class<EdgeSlot>("EdgeSlot")({
  edgeType: EdgeType,
  ends: EdgeEnds
}) {
  /**
   * The slot as `TYPE From->To`, the key slots group and sort by.
   *
   * @since 0.8.0
   */
  key(): string {
    return `${this.edgeType} ${this.ends.from}->${this.ends.to}`
  }
}
