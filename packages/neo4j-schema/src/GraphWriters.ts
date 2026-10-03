/**
 * The one writer of each vertex label and edge slot of an assembled graph
 * schema.
 *
 * @since 0.8.0
 */
import { type HashMap, Option, Schema } from "effect"
import { EdgeSlot } from "./EdgeSlot.js"
import { ContributingModule, VertexLabel } from "./GraphVocabulary.js"
import { unionIfAgreeing } from "./internal/AgreeingUnion.js"

/** The owner of each vertex label. */
class VertexWriters extends Schema.Class<VertexWriters>("VertexWriters")({
  byLabel: Schema.HashMap(VertexLabel, ContributingModule)
}) {
  union(that: VertexWriters): Option.Option<VertexWriters> {
    return Option.map(this.byLabel.pipe(unionIfAgreeing(that.byLabel)), (byLabel) => new VertexWriters({ byLabel }))
  }
}

/** The owner of each edge slot. */
class EdgeWriters extends Schema.Class<EdgeWriters>("EdgeWriters")({
  bySlot: Schema.HashMap(EdgeSlot, ContributingModule)
}) {
  union(that: EdgeWriters): Option.Option<EdgeWriters> {
    return Option.map(this.bySlot.pipe(unionIfAgreeing(that.bySlot)), (bySlot) => new EdgeWriters({ bySlot }))
  }
}

/**
 * The owner of each vertex label and each edge slot.
 *
 * @since 0.8.0
 * @category models
 */
export class GraphWriters extends Schema.Class<GraphWriters>("GraphWriters")({
  vertices: VertexWriters,
  edges: EdgeWriters
}) {
  /**
   * @since 0.8.0
   */
  static of(
    byLabel: HashMap.HashMap<VertexLabel, ContributingModule>,
    bySlot: HashMap.HashMap<EdgeSlot, ContributingModule>
  ): GraphWriters {
    return new GraphWriters({ vertices: new VertexWriters({ byLabel }), edges: new EdgeWriters({ bySlot }) })
  }

  /**
   * Both owner maps, or none when they name different owners for one label
   * or slot.
   *
   * @since 0.8.0
   */
  union(that: GraphWriters): Option.Option<GraphWriters> {
    return Option.map(
      Option.all({ vertices: this.vertices.union(that.vertices), edges: this.edges.union(that.edges) }),
      (parts) => new GraphWriters(parts)
    )
  }
}
