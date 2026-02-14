import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { randomUUID } from "crypto"
import type { Scope } from "effect"
import { Effect, Exit, Layer, pipe } from "effect"
import path from "path"
import { NoMatchingFiles, templateIdFromFiles } from "../src/templateIdFromFilesHash.js"

const fixturesDirectory = path.join(process.cwd(), "__fixtures__")

describe(`templateIdFromFilesHash`, () => {
  const dependencies = pipe(
    makeLiveFixturesService(fixturesDirectory),
    Layer.provideMerge(
      NodeFileSystem.layer
    )
  )

  it.scoped(`Zero matching files fails`, () =>
    pipe(
      Effect.gen(function*() {
        yield* FixturesService.createRandomFile(".whatever")

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
        yield* FixturesService.createRandomFile(".A")
        yield* FixturesService.createRandomFile(".B")

        const [idA, idB] = yield* pipe(
          templateIdFromFiles(["**/*.A"]),
          Effect.zip(
            templateIdFromFiles(["**/*.B"])
          )
        )

        expect(idA).not.toStrictEqual(idB)
      }),
      Effect.provide(dependencies)
    ))

  it.scoped(`Same file, same template id`, () =>
    pipe(
      Effect.gen(function*() {
        yield* FixturesService.createRandomFile(".whatever")

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
        const filePath = yield* FixturesService.createRandomFile(".whatever")
        const idA = yield* templateIdFromFiles(["**/*.whatever"])

        yield* FixturesService.writeFile(filePath, "new_content")
        const idB = yield* templateIdFromFiles(["**/*.whatever"])

        expect(idA).not.toStrictEqual(idB)
      }),
      Effect.provide(dependencies)
    ))
})

class FixturesService extends Effect.Tag("FixturesService")<FixturesService, {
  createRandomFile(extension: string): Effect.Effect<string, never, Scope.Scope>
  writeFile(path: string, content: string): Effect.Effect<void>
}>() {}

const makeLiveFixturesService = (fixturesDirectory: string) =>
  Layer.effect(
    FixturesService,
    pipe(
      FileSystem.FileSystem,
      Effect.flatMap((fs) =>
        pipe(
          fs.exists(fixturesDirectory),
          Effect.if({
            onTrue: () => Effect.void,
            onFalse: () => fs.makeDirectory(fixturesDirectory)
          }),
          Effect.map(() => {
            return FixturesService.of({
              createRandomFile: (extension) =>
                pipe(
                  fs.makeTempFileScoped({ directory: fixturesDirectory, suffix: extension }),
                  Effect.tap((filePath) => fs.writeFileString(filePath, randomUUID())),
                  Effect.orDie
                ),
              writeFile: (path, content) =>
                pipe(
                  fs.writeFileString(path, content),
                  Effect.orDie
                )
            })
          })
        )
      )
    )
  )
