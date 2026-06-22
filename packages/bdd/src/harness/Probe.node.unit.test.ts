import { describe, expect, it } from "@effect/vitest"
import { Context, Effect } from "effect"
import { run, scenario, ScenarioError } from "../index.js"
import { probe } from "./Probe.js"

class Beacon extends Context.Service<Beacon, {
  readonly ping: (label: string) => Effect.Effect<void>
  readonly pong: () => Effect.Effect<void>
}>()("Beacon") {}

describe("Probe", () => {
  it.effect("records the calls made to the mocked service", () =>
    Effect.gen(function*() {
      const beacon = probe<string>()("beacon", Beacon, (record) => ({ ping: (label) => record(label) }))

      const pinging = scenario("pinging twice")
        .when("the use case pings twice", () =>
          Effect.gen(function*() {
            const service = yield* Beacon
            yield* service.ping("a")
            yield* service.ping("b")
          }))
        .then("it pinged with a then b", () =>
          Effect.map(beacon.calls, (calls) => {
            expect(calls).toEqual(["a", "b"])
          }))

      yield* run(pinging).pipe(Effect.provide(beacon.layer))
    }))

  it.effect("fails loudly when an unimplemented member is exercised", () =>
    Effect.gen(function*() {
      const beacon = probe<string>()("beacon", Beacon, (record) => ({ ping: (label) => record(label) }))

      const ponging = scenario("calling an unimplemented method")
        .when("the use case pongs", () => Effect.flatMap(Beacon, (service) => service.pong()))
        .then("never reached", () => {})

      const error = yield* Effect.flip(run(ponging).pipe(Effect.provide(beacon.layer)))
      expect(error).toBeInstanceOf(ScenarioError)
    }))
})
