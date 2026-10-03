/**
 * One annotation per vertex label, as an assembled graph schema's projection
 * reads it off the declarations.
 *
 * @since 0.8.0
 */
import type { Result } from "effect"
import { Array, Data, Effect, HashMap, HashSet, Option, Order, Schema, SchemaIssue, SchemaParser } from "effect"
import { VertexLabel } from "./GraphVocabulary.js"
import { compatibleUnion, unlessConflicting } from "./internal/AgreeingUnion.js"
import { SchemaConflict } from "./SchemaConflict.js"

/**
 * One annotation per vertex label. Annotations unite as a bounded semilattice
 * with `empty` as identity; two that annotate one label differently refuse to
 * unite.
 *
 * @since 0.8.0
 * @category models
 */
export class VertexAnnotations<A> extends Data.Class {
  constructor(private readonly byLabel: HashMap.HashMap<VertexLabel, A>) {
    super()
  }

  /**
   * No annotation on any label: the identity of `union`.
   *
   * @since 0.8.0
   */
  static empty<A>(): VertexAnnotations<A> {
    return new VertexAnnotations(HashMap.empty())
  }

  /**
   * The schema of annotations whose values `annotation` decodes, for embedding
   * in a `Schema.Class`.
   *
   * @since 0.8.0
   */
  static schema<S extends Schema.Top>(annotation: S) {
    return Schema.declareConstructor<VertexAnnotations<S["Type"]>, VertexAnnotations<S["Encoded"]>>()(
      [annotation],
      ([element]) => (input, ast, options) =>
        input instanceof VertexAnnotations
          ? Effect.map(
            SchemaParser.decodeUnknownEffect(Schema.HashMap(VertexLabel, element))(input.byLabel, options),
            (byLabel) => new VertexAnnotations(byLabel)
          )
          : Effect.fail(new SchemaIssue.InvalidType(ast, Option.some(input))),
      { expected: "VertexAnnotations" }
    )
  }

  /**
   * The annotation of `label`, or none when the label is not annotated.
   *
   * @since 0.8.0
   */
  annotationOf(label: VertexLabel): Option.Option<A> {
    return HashMap.get(this.byLabel, label)
  }

  /**
   * The annotated labels, sorted.
   *
   * @since 0.8.0
   */
  labels(): ReadonlyArray<VertexLabel> {
    return Array.sort(HashMap.keys(this.byLabel), Order.String)
  }

  /**
   * Both sets of annotations, or a `ConflictingVertexAnnotations` naming a
   * label they annotate differently.
   *
   * @since 0.8.0
   */
  union(that: VertexAnnotations<A>): Result.Result<VertexAnnotations<A>, SchemaConflict> {
    const labelled = compatibleUnion(
      [...HashMap.toEntries(this.byLabel), ...HashMap.toEntries(that.byLabel)],
      ([label]) => label,
      ([[label]]) => SchemaConflict.cases.ConflictingVertexAnnotations.make({ label })
    )
    return unlessConflicting(
      Array.getFailures(labelled),
      () => new VertexAnnotations(HashMap.fromIterable(Array.getSuccesses(labelled)))
    )
  }

  /**
   * The annotations of `labels` alone.
   *
   * @since 0.8.0
   */
  restrictedTo(labels: Iterable<VertexLabel>): VertexAnnotations<A> {
    const kept = HashSet.fromIterable(labels)
    return new VertexAnnotations(HashMap.filter(this.byLabel, (_, label) => HashSet.has(kept, label)))
  }
}
