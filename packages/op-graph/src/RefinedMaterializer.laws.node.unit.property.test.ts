import { describe, expect, it } from "@effect/vitest"
import { Arbitrary, Array, Effect, Function, Layer, Ref, Result, Schema, Stream } from "effect"
import { type GraphOp, UpsertVertex } from "./GraphOp.js"
import { GraphOpMaterializer, MaterializeProgress } from "./GraphOpMaterializer.js"
import { refinedMaterializer } from "./RefinedMaterializer.js"

class RefusalError extends Schema.TaggedError<RefusalError>()("RefusalError", { id: Schema.String }) {
  override get message() {
    return `refused ${this.id}`
  }
}

type Batch = ReadonlyArray<GraphOp>
type Refine = (ops: Batch) => Result.Result<Batch, RefusalError>
type Decorator = (base: Layer.Layer<GraphOpMaterializer>) => Layer.Layer<GraphOpMaterializer>

const idOf = (op: GraphOp): unknown => (op instanceof UpsertVertex ? op.key.id : undefined)

const arbLabel = Arbitrary.schema(Schema.Literals(["Alpha", "Beta"]))
const arbId = Arbitrary.schema(Schema.Literals(["a", "b", "c", "d"]))

const arbOp: Arbitrary.Arbitrary<GraphOp> = Arbitrary.all([arbLabel, arbId]).pipe(
  Arbitrary.map(([label, id]): GraphOp => new UpsertVertex({ label, key: { id }, properties: {} }))
)

const arbOps = Arbitrary.array(arbOp, { maxLength: 6 })

const refuseOp = (id: string) => (op: GraphOp): Result.Result<GraphOp, RefusalError> =>
  idOf(op) === id ? Result.fail(new RefusalError({ id })) : Result.succeed(op)

const refuseId = (id: string): Refine => (ops) => Result.all(ops.map(refuseOp(id)))

const rewriteLabel = (from: string, to: string): Refine => (ops) =>
  Result.succeed(
    ops.map((op) => (op instanceof UpsertVertex && op.label === from ? new UpsertVertex({ ...op, label: to }) : op))
  )

const refinementsByKind = {
  refuse: arbId.pipe(Arbitrary.map(refuseId)),
  rewrite: Arbitrary.all([arbLabel, arbLabel]).pipe(Arbitrary.map(([from, to]) => rewriteLabel(from, to))),
  identity: Arbitrary.Constant<Refine>(Result.succeed)
}

const arbRefine: Arbitrary.Arbitrary<Refine> = Arbitrary.schema(
  Schema.Literals(["refuse", "rewrite", "identity"])
).pipe(Arbitrary.flatMap((kind) => refinementsByKind[kind]))

const kleisli = (f: Refine, g: Refine): Refine => (ops) => Result.flatMap(f(ops), g)

const observe = (decorator: Decorator, ops: Batch) =>
  Effect.gen(function*() {
    const calls = yield* Ref.make<ReadonlyArray<Batch>>([])
    const base = Layer.succeed(GraphOpMaterializer, {
      materialize: (batch: Batch) =>
        Stream.fromEffect(
          Ref.update(calls, Array.append(batch)).pipe(
            Effect.as(
              new MaterializeProgress({
                processed: batch.length,
                total: batch.length,
                counts: new Map(),
                dropped: new Map()
              })
            )
          )
        )
    })
    const outcome = yield* Effect.gen(function*() {
      const m = yield* GraphOpMaterializer
      return yield* Stream.runCollect(m.materialize(ops))
    }).pipe(Effect.provide(decorator(base)), Effect.result)
    return { calls: yield* Ref.get(calls), failure: Result.isFailure(outcome) ? outcome.failure : undefined }
  })

const decoratorOf = (refine: Refine): Decorator => refinedMaterializer(refine)
const composeDecorators = (a: Decorator, b: Decorator): Decorator => (base) => a(b(base))

const sameBehaviour = (a: Decorator, b: Decorator, ops: Batch) =>
  Effect.gen(function*() {
    expect(yield* observe(a, ops)).toEqual(yield* observe(b, ops))
  })

describe("refinedMaterializer", () => {
  it.effect.prop(
    "law: the identity refinement is the base",
    [arbOps],
    ([ops]) => sameBehaviour(decoratorOf(Result.succeed), Function.identity, ops)
  )

  it.effect.prop(
    "law: refining by f then g is one refinement by their Kleisli composition",
    [arbRefine, arbRefine, arbOps],
    ([f, g, ops]) => sameBehaviour(decoratorOf(kleisli(f, g)), composeDecorators(decoratorOf(f), decoratorOf(g)), ops)
  )

  it.effect.prop(
    "law: a refusal fails the stream with it and no op reaches the base",
    [arbOps, arbId],
    ([ops, id]) =>
      Effect.gen(function*() {
        const outcome = yield* observe(decoratorOf(refuseId(id)), ops)
        const refused = ops.some((op) => idOf(op) === id)
        expect(outcome.failure).toEqual(refused ? new RefusalError({ id }) : undefined)
        expect(outcome.calls).toEqual(refused ? [] : [ops])
      })
  )
})
