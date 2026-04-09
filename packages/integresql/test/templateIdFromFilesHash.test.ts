import { NodeContext } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, pipe } from "effect"
import path from "path"
import { NoMatchingFiles, templateIdFromFiles } from "../src/templateIdFromFilesHash.js"
import { Sandbox } from "./Sandbox.js"

const dependencies = NodeContext.layer

describe(`templateIdFromFilesHash`, () => {
  it.scoped(`Zero matching files fails`, () =>
    pipe(
      Effect.gen(function*() {
        const sandbox = yield* Sandbox

        const result = yield* pipe(
          templateIdFromFiles(["**/*.non_exitsting"], sandbox.root),
          Effect.exit
        )

        expect(result).toStrictEqual<typeof result>(
          Exit.fail(
            new NoMatchingFiles([path.join(sandbox.root, "**/*.non_exitsting")])
          )
        )
      }),
      Effect.provide(dependencies)
    ))

  it.scoped(`Different file, different id`, () =>
    pipe(
      Effect.gen(function*() {
        const sandbox = yield* Sandbox
        yield* sandbox.createRandomFile("filename.A")
        yield* sandbox.createRandomFile("filename.B")

        const [idA, idB] = yield* pipe(
          templateIdFromFiles(["**/*.A"], sandbox.root),
          Effect.zip(templateIdFromFiles(["**/*.B"], sandbox.root))
        )

        expect(idA).not.toStrictEqual(idB)
      }),
      Effect.provide(dependencies)
    ))

  it.scoped(`Same file, same template id`, () =>
    pipe(
      Effect.gen(function*() {
        const sandbox = yield* Sandbox
        yield* sandbox.createRandomFile("filename.whatever")

        const [idA, idB] = yield* pipe(
          templateIdFromFiles(["**/*.whatever"], sandbox.root),
          Effect.zip(templateIdFromFiles(["**/*.whatever"], sandbox.root))
        )

        expect(idA).toStrictEqual(idB)
      }),
      Effect.provide(dependencies)
    ))

  it.scoped(`Same file, different content, different id`, () =>
    pipe(
      Effect.gen(function*() {
        const sandbox = yield* Sandbox
        const filename = "filename.whatever"
        yield* sandbox.createRandomFile(filename)
        const idA = yield* templateIdFromFiles(["**/*.whatever"], sandbox.root)

        yield* sandbox.writeFile(filename, "new_content")
        const idB = yield* templateIdFromFiles(["**/*.whatever"], sandbox.root)

        expect(idA).not.toStrictEqual(idB)
      }),
      Effect.provide(dependencies)
    ))
})
