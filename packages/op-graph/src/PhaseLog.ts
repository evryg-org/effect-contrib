import { Duration, Effect } from "effect"

/** Milliseconds below one second, whole seconds from there on (`300ms`, `45s`, `1m 5s`). */
export const formatElapsed = (elapsed: Duration.Duration): string =>
  Duration.toSeconds(elapsed) < 1
    ? `${Duration.toMillis(elapsed)}ms`
    : Duration.format(Duration.seconds(Math.round(Duration.toSeconds(elapsed))))

/** Times a phase that yields ops and logs `<phase> <n> ops (<elapsed>)` when it took at least
 *  `minimum`. A faster phase logs nothing, and neither does a failing one. */
export const logPhase = (phase: string, minimum: Duration.Duration = Duration.seconds(1)) =>
  <A extends ReadonlyArray<unknown>, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.timed(self).pipe(
      Effect.tap(([elapsed, items]) =>
        Effect.when(
          Effect.log(`${phase} ${items.length} ops (${formatElapsed(elapsed)})`),
          Effect.succeed(Duration.isGreaterThanOrEqualTo(elapsed, minimum)),
        )),
      Effect.map(([, items]) => items),
    )
