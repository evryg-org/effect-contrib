import { Schema, SchemaTransformation } from "effect"
import { GraphOp, GraphOpArray } from "./GraphOp.js"

/**
 * Build the one-way `Schema.Codec<readonly GraphOp[], A>` a `TaskImpl` requires
 * from a plain `A -> readonly GraphOp[]` mapper. Collapses the repeated
 * `Schema.decodeTo(GraphOpArray, transform({ decode, encode: throw }))` boilerplate.
 *
 * GraphOps are derived, never re-read, so the codec is decode-only; `encode`
 * throws to make the one-way intent explicit.
 */
export const graphOpAdapter = <A>(
  toOps: (a: A) => ReadonlyArray<GraphOp>,
): Schema.Codec<ReadonlyArray<GraphOp>, A> =>
  Schema.Any.pipe(
    Schema.decodeTo(
      GraphOpArray,
      SchemaTransformation.transform<typeof GraphOpArray.Encoded, A>({
        decode: (a) => toOps(a) as typeof GraphOpArray.Encoded,
        encode: () => {
          throw new Error("graphOpAdapter is one-way (decode only)")
        },
      }),
    ),
  ) as unknown as Schema.Codec<ReadonlyArray<GraphOp>, A>
