import { it, expect } from "@effect/vitest"
import { Effect, Layer, Ref, Result, Schema, Stream } from "effect"
import { DeclarationIndex, DeclarationViolationError, NullOnRequired, VertexDeclaration } from "./DeclarationCheck.js"
import { declarationCheckedMaterializer } from "./DeclarationCheckedMaterializer.js"
import { UpsertVertex, type GraphOp } from "./GraphOp.js"
import { GraphOpMaterializer, MaterializeProgress } from "./GraphOpMaterializer.js"

const recordingBase = (recorded: Ref.Ref<ReadonlyArray<GraphOp>>) =>
  Layer.succeed(GraphOpMaterializer, {
    materialize: (ops: ReadonlyArray<GraphOp>) =>
      Stream.fromEffect(
        Ref.set(recorded, ops).pipe(
          Effect.as(
            new MaterializeProgress({ processed: ops.length, total: ops.length, counts: new Map(), dropped: new Map() }),
          ),
        ),
      ),
  })

const indexed = () =>
  Result.getOrThrow(
    DeclarationIndex.fromDeclarations([
      new VertexDeclaration({ label: "Alpha", fields: { id: Schema.String, category: Schema.String } }),
    ]),
  )

it.effect("hands a declared batch to the base materializer unchanged", () =>
  Effect.gen(function* () {
    const ops: ReadonlyArray<GraphOp> = [
      new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { category: "core" } }),
    ]
    const recorded = yield* Ref.make<ReadonlyArray<GraphOp>>([])
    yield* Effect.gen(function* () {
      const m = yield* GraphOpMaterializer
      yield* Stream.runDrain(m.materialize(ops))
    }).pipe(Effect.provide(declarationCheckedMaterializer(indexed())(recordingBase(recorded))))

    expect(yield* Ref.get(recorded)).toEqual(ops)
  }),
)

it.effect("fails the stream on an undeclared write, and the base sees nothing", () =>
  Effect.gen(function* () {
    const ops: ReadonlyArray<GraphOp> = [
      new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { category: "core" } }),
      new UpsertVertex({ label: "Alpha", key: { id: "a2" }, properties: { category: null } }),
    ]
    const recorded = yield* Ref.make<ReadonlyArray<GraphOp>>([])
    const failure = yield* Effect.gen(function* () {
      const m = yield* GraphOpMaterializer
      yield* Stream.runDrain(m.materialize(ops))
    }).pipe(Effect.provide(declarationCheckedMaterializer(indexed())(recordingBase(recorded))), Effect.flip)

    expect(failure).toBeInstanceOf(DeclarationViolationError)
    expect((failure as DeclarationViolationError).reason).toEqual(new NullOnRequired({ property: "category" }))
    expect(yield* Ref.get(recorded)).toEqual([])
  }),
)
