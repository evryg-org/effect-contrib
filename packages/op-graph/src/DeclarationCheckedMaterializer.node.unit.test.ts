import { expect, it } from "@effect/vitest"
import { Clock, Duration, Effect, Layer, Logger, Predicate, Ref, Result, Schema, Stream } from "effect"
import { DeclarationIndex, DeclarationViolationError, NullOnRequired, VertexDeclaration } from "./DeclarationCheck.js"
import { declarationCheckedMaterializer } from "./DeclarationCheckedMaterializer.js"
import { type GraphOp, UpsertVertex } from "./GraphOp.js"
import { GraphOpMaterializer, MaterializeProgress } from "./GraphOpMaterializer.js"

const recordingBase = (recorded: Ref.Ref<ReadonlyArray<GraphOp>>) =>
  Layer.succeed(GraphOpMaterializer, {
    materialize: (ops: ReadonlyArray<GraphOp>) =>
      Stream.fromEffect(
        Ref.set(recorded, ops).pipe(
          Effect.as(
            new MaterializeProgress({ processed: ops.length, total: ops.length, counts: new Map(), dropped: new Map() })
          )
        )
      )
  })

/** Every reading lands `step` past the previous one, so a timed span over pure code measures `step`. */
const steppingClock = (step: Duration.Duration): Clock.Clock => {
  let nanos = 0n
  const next = () => (nanos += Duration.toNanosUnsafe(step))
  return {
    currentTimeNanosUnsafe: next,
    currentTimeNanos: Effect.sync(next),
    currentTimeMillisUnsafe: () => Number(next() / 1_000_000n),
    currentTimeMillis: Effect.sync(() => Number(next() / 1_000_000n)),
    sleep: () => Effect.void
  }
}

const capturingLogger = () => {
  const lines: Array<string> = []
  const layer = Logger.layer([Logger.make(({ message }) => {
    lines.push(
      Predicate.isString(message) ? message : globalThis.Array.isArray(message) ? message.join(" ") : String(message)
    )
  })])
  return { lines, layer }
}

const indexed = () =>
  Result.getOrThrow(
    DeclarationIndex.fromDeclarations([
      new VertexDeclaration({ label: "Alpha", fields: { id: Schema.String, category: Schema.String } })
    ])
  )

it.effect("hands a declared batch to the base materializer unchanged", () =>
  Effect.gen(function*() {
    const ops: ReadonlyArray<GraphOp> = [
      new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { category: "core" } })
    ]
    const recorded = yield* Ref.make<ReadonlyArray<GraphOp>>([])
    yield* Effect.gen(function*() {
      const m = yield* GraphOpMaterializer
      yield* Stream.runDrain(m.materialize(ops))
    }).pipe(Effect.provide(declarationCheckedMaterializer(indexed())(recordingBase(recorded))))

    expect(yield* Ref.get(recorded)).toEqual(ops)
  }))

it.effect("fails the stream on an undeclared write, and the base sees nothing", () =>
  Effect.gen(function*() {
    const ops: ReadonlyArray<GraphOp> = [
      new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { category: "core" } }),
      new UpsertVertex({ label: "Alpha", key: { id: "a2" }, properties: { category: null } })
    ]
    const recorded = yield* Ref.make<ReadonlyArray<GraphOp>>([])
    const failure = yield* Effect.gen(function*() {
      const m = yield* GraphOpMaterializer
      yield* Stream.runDrain(m.materialize(ops))
    }).pipe(Effect.provide(declarationCheckedMaterializer(indexed())(recordingBase(recorded))), Effect.flip)

    expect(failure).toBeInstanceOf(DeclarationViolationError)
    expect((failure as DeclarationViolationError).reason).toEqual(new NullOnRequired({ property: "category" }))
    expect(yield* Ref.get(recorded)).toEqual([])
  }))

it.effect("logs the check with the op count when it is slow", () => {
  const { layer, lines } = capturingLogger()
  return Effect.gen(function*() {
    const ops: ReadonlyArray<GraphOp> = [
      new UpsertVertex({ label: "Alpha", key: { id: "a1" }, properties: { category: "core" } }),
      new UpsertVertex({ label: "Alpha", key: { id: "a2" }, properties: { category: "edge" } })
    ]
    const recorded = yield* Ref.make<ReadonlyArray<GraphOp>>([])
    yield* Effect.gen(function*() {
      const m = yield* GraphOpMaterializer
      yield* Stream.runDrain(m.materialize(ops))
    }).pipe(
      Effect.provide(declarationCheckedMaterializer(indexed())(recordingBase(recorded))),
      Effect.provideService(Clock.Clock, steppingClock(Duration.seconds(2))),
      Effect.provide(layer)
    )

    expect(lines).toEqual(["declaration-checked 2 ops (2s)"])
  })
})

it.effect("a refused batch logs no phase line", () => {
  const { layer, lines } = capturingLogger()
  return Effect.gen(function*() {
    const ops: ReadonlyArray<GraphOp> = [
      new UpsertVertex({ label: "Alpha", key: { id: "a2" }, properties: { category: null } })
    ]
    const recorded = yield* Ref.make<ReadonlyArray<GraphOp>>([])
    yield* Effect.gen(function*() {
      const m = yield* GraphOpMaterializer
      yield* Stream.runDrain(m.materialize(ops))
    }).pipe(
      Effect.provide(declarationCheckedMaterializer(indexed())(recordingBase(recorded))),
      Effect.provideService(Clock.Clock, steppingClock(Duration.seconds(2))),
      Effect.provide(layer),
      Effect.flip
    )

    expect(lines).toEqual([])
  })
})
