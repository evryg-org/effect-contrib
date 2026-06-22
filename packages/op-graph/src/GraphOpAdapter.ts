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
  // The source carries `A` opaquely (decode-only adapter), so the resulting codec's Encoded side
  // is exactly `A` — no outer cast needed. The predicate is never exercised: only `decode` runs.
  Schema.declare<A>((_): _ is A => true).pipe(
    Schema.decodeTo(
      GraphOpArray,
      SchemaTransformation.transform<typeof GraphOpArray.Encoded, A>({
        decode: (a) => toOps(a) as typeof GraphOpArray.Encoded,
        encode: () => {
          throw new Error("graphOpAdapter is one-way (decode only)")
        },
      }),
    ),
  )
