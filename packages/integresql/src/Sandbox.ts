/**
 * @since 0.0.1
 */
import { FileSystem, Path } from "@effect/platform"
import { randomUUID } from "crypto"
import { Effect, pipe } from "effect"

/**
 * @since 0.0.1
 */
export const Sandbox = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* fs.makeTempDirectoryScoped()

  return {
    root,
    createRandomFile: (filename: string): Effect.Effect<void> =>
      pipe(
        fs.writeFileString(path.join(root, filename), randomUUID()), //
        Effect.orDie
      ),
    writeFile: (filename: string, content: string): Effect.Effect<void> =>
      pipe(
        fs.writeFileString(path.join(root, filename), content), //
        Effect.orDie
      ),
    readFile: (filename: string): Effect.Effect<string> =>
      pipe(
        fs.readFileString(path.join(root, filename)), //
        Effect.orDie
      )
  }
})
