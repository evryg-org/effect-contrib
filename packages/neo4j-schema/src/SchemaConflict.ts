/**
 * Why contributions cannot be assembled into one graph schema.
 *
 * @since 0.8.0
 */
import { Schema } from "effect"
import { EdgeEnds } from "./EdgeSlot.js"
import {
  ContributingModule,
  ContributingModules,
  EdgeType,
  FullTextIndexName,
  PropertyName,
  PropertyNames,
  VertexLabel
} from "./GraphVocabulary.js"

/**
 * Why contributions cannot be assembled: a vertex label declared twice, an
 * edge slot shared by modules or declared with differing fields, a fulltext
 * index declared over differing fields, an edge property whose Neo4j type
 * differs across endpoint pairs, or a vertex annotated differently.
 *
 * @since 0.8.0
 * @category errors
 */
export const SchemaConflict = Schema.TaggedUnion({
  DuplicateVertexLabel: { label: VertexLabel, owners: ContributingModules },
  SharedEdgeSlot: { edgeType: EdgeType, ends: EdgeEnds, owners: ContributingModules },
  ConflictingEdgeFields: { edgeType: EdgeType, ends: EdgeEnds, owner: ContributingModule },
  ConflictingFullTextFields: { index: FullTextIndexName, fields: PropertyNames, conflictingFields: PropertyNames },
  ConflictingEdgePropertyTypes: { edgeType: EdgeType, property: PropertyName, owners: ContributingModules },
  ConflictingVertexAnnotations: { label: VertexLabel }
})

/**
 * @since 0.8.0
 * @category errors
 */
export type SchemaConflict = typeof SchemaConflict.Type
