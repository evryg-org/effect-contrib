import type { Scope } from "effect"
import { Effect } from "effect"
import type { StartedTestContainer } from "testcontainers"

export const acquireContainer = <C extends StartedTestContainer>(
  start: () => Promise<C>
): Effect.Effect<C, Error, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({ try: start, catch: (e) => new Error(String(e)) }),
    (c) => Effect.promise(() => c.stop()).pipe(Effect.orDie)
  )
