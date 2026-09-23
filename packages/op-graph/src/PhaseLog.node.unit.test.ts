import { describe, it, expect } from "@effect/vitest"
import { Duration, Effect, Logger, Predicate } from "effect"
import { TestClock } from "effect/testing"
import { formatElapsed, logPhase } from "./PhaseLog.js"

const capturingLogger = () => {
  const lines: string[] = []
  const layer = Logger.layer([Logger.make(({ message }) => {
    lines.push(Predicate.isString(message) ? message : globalThis.Array.isArray(message) ? message.join(" ") : String(message))
  })])
  return { lines, layer }
}

const phaseTaking = (duration: Duration.Input) =>
  TestClock.adjust(duration).pipe(Effect.as(["a", "b", "c"] as const), logPhase("decoded"))

describe("logPhase", () => {
  it.effect("logs the phase with its op count and elapsed when it reaches the threshold", () => {
    const { lines, layer } = capturingLogger()
    return Effect.gen(function* () {
      const items = yield* phaseTaking("2 seconds")
      expect(items).toEqual(["a", "b", "c"])
      expect(lines).toEqual(["decoded 3 ops (2s)"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("logs nothing for a phase faster than the threshold", () => {
    const { lines, layer } = capturingLogger()
    return Effect.gen(function* () {
      yield* phaseTaking("200 millis")
      expect(lines).toEqual([])
    }).pipe(Effect.provide(layer))
  })

  it.effect("logs nothing for a failing phase and propagates its failure", () => {
    const { lines, layer } = capturingLogger()
    return Effect.gen(function* () {
      const failure = yield* TestClock.adjust("2 seconds").pipe(
        Effect.andThen(Effect.fail("boom")),
        Effect.as([] as ReadonlyArray<never>),
        logPhase("decoded"),
        Effect.flip,
      )
      expect(failure).toBe("boom")
      expect(lines).toEqual([])
    }).pipe(Effect.provide(layer))
  })
})

describe("formatElapsed", () => {
  it("shows milliseconds below one second", () => {
    expect(formatElapsed(Duration.millis(300))).toBe("300ms")
  })

  it("rounds to whole seconds from one second on", () => {
    expect(formatElapsed(Duration.millis(45300))).toBe("45s")
    expect(formatElapsed(Duration.millis(65000))).toBe("1m 5s")
  })
})
