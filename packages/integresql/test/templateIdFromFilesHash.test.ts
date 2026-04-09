import { FileSystem, Path } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { randomUUID } from "crypto"
import { Effect, Exit, pipe } from "effect"
import path from "path"
import { NoMatchingFiles, templateIdFromFiles } from "../src/templateIdFromFilesHash.js"

describe(`templateIdFromFilesHash`, () => {
  const dependencies = NodeContext.layer

  it.scoped(`Zero matching files fails`, () =>
    pipe(
      Effect.gen(function*() {
        yield* Sandbox.createRandomFile(".whatever")

        const result = yield* pipe(
          templateIdFromFiles(["**/*.non_exitsting"]),
          Effect.exit
        )

        expect(result).toStrictEqual<typeof result>(
          Exit.fail(
            new NoMatchingFiles([
              path.join(
                process.cwd(),
                "**/*.non_exitsting"
              )
            ])
          )
        )
      }),
      Effect.provide(dependencies)
    ))

  it.scoped(`Different file, different id`, () =>
    pipe(
      Effect.gen(function*() {
        const sandbox = yield* makeSandbox
        yield* sandbox.createRandomFile("filename.A")
        yield* sandbox.createRandomFile("filename.B")

        const [idA, idB] = yield* pipe(
          templateIdFromFiles(["**/*.A"], sandbox.root),
          Effect.zip(
            templateIdFromFiles(["**/*.B"], sandbox.root)
          )
        )

        expect(idA).not.toStrictEqual(idB)
      }),
      Effect.provide(dependencies)
    ))

  it.scoped(`Same file, same template id`, () =>
    pipe(
      Effect.gen(function*() {
        yield* Sandbox.createRandomFile(".whatever")

        const [idA, idB] = yield* pipe(
          templateIdFromFiles(["**/*.whatever"]),
          Effect.zip(
            templateIdFromFiles(["**/*.whatever"])
          )
        )

        expect(idA).toStrictEqual(idB)
      }),
      Effect.provide(dependencies)
    ))

  it.scoped(`Same file, different content, different id`, () =>
    pipe(
      Effect.gen(function*() {
        const filePath = yield* Sandbox.createRandomFile(".whatever")
        const idA = yield* templateIdFromFiles(["**/*.whatever"])

        yield* Sandbox.writeFile(filePath, "new_content")
        const idB = yield* templateIdFromFiles(["**/*.whatever"])

        expect(idA).not.toStrictEqual(idB)
      }),
      Effect.provide(dependencies)
    ))
})

const makeSandbox = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* fs.makeTempDirectoryScoped()

  return ({
    root,
    createRandomFile: (filename: string): Effect.Effect<string> =>
      pipe(
        fs.writeFileString(path.join(root, filename), randomUUID()),
        Effect.orDie
      ),
    writeFile: (filename: string, content: string) =>
      pipe(
        fs.writeFileString(path.join(root, filename), content),
        Effect.orDie
      )
  })
})
