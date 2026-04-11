import { Context, Effect, Layer } from "effect"
import { DockerComposeEnvironment, type StartedDockerComposeEnvironment } from "testcontainers"

export class ComposeEnvironment extends Context.Tag("ComposeEnvironment")<
  ComposeEnvironment,
  StartedDockerComposeEnvironment
>() {}

export interface ComposeOptions {
  readonly composeFilePath: string
  readonly composeFile: string
  readonly waitStrategy?: (env: DockerComposeEnvironment) => DockerComposeEnvironment
  readonly executable?: { executablePath?: string; standalone?: boolean; options?: string[] }
}

export const makeComposeContainer = (
  opts: ComposeOptions,
): Layer.Layer<ComposeEnvironment, Error> =>
  Layer.scoped(
    ComposeEnvironment,
    Effect.gen(function* () {
      let env = new DockerComposeEnvironment(opts.composeFilePath, opts.composeFile)
      if (opts.executable) env = env.withClientOptions({ executable: opts.executable }) as DockerComposeEnvironment
      if (opts.waitStrategy) env = opts.waitStrategy(env) as DockerComposeEnvironment
      const started = yield* Effect.acquireRelease(
        Effect.tryPromise({ try: () => env.up(), catch: (e) => new Error(String(e)) }),
        (c) => Effect.promise(() => c.down()).pipe(Effect.orDie),
      )
      yield* Effect.log("[testcontainers] Compose started")
      return started
    }),
  )
