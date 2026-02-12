import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, pipe } from "effect"
import crypto, { randomUUID } from "node:crypto"
import type { DatabaseTemplateId } from "../src/index.js"
import { makeIntegreSqlClient, NoSuchTemplate } from "../src/IntegreSqlClient.js"
import { startContainers } from "./startContainers.js"

describe(`IntegreSqlClient`, () => {
  describe("finalizeTemplate", () => {
    it.effect(
      `Non-existing template fails with NoSuchTemplate`,
      () =>
        pipe(
          Effect.gen(function*() {
            const containers = yield* startContainers
            const client = makeIntegreSqlClient({
              integrePort: containers.integreSQL.port,
              integreHost: containers.integreSQL.host
            })
            const existingHash = makeRandomHash()
            const nonExistingHash = makeRandomHash()
            yield* client.createTemplate(existingHash)

            const result = yield* pipe(
              client.finalizeTemplate(nonExistingHash),
              Effect.exit
            )

            expect(result).toStrictEqual<typeof result>(
              Exit.fail(new NoSuchTemplate({ id: nonExistingHash }))
            )
          }),
          Effect.scoped
        ),
      1000 * 50
    )

    it.effect(
      `Non finalized template succeeeds`,
      () =>
        pipe(
          Effect.gen(function*() {
            const containers = yield* startContainers
            const client = makeIntegreSqlClient({
              integrePort: containers.integreSQL.port,
              integreHost: containers.integreSQL.host
            })
            const existingHash = makeRandomHash()
            yield* client.createTemplate(existingHash)

            const result = yield* pipe(
              client.finalizeTemplate(existingHash),
              Effect.exit
            )

            expect(result).toStrictEqual<typeof result>(
              Exit.void
            )
          }),
          Effect.scoped
        ),
      1000 * 50
    )

    it.effect(
      `Template already finalized`,
      () =>
        pipe(
          Effect.gen(function*() {
            const containers = yield* startContainers
            const client = makeIntegreSqlClient({
              integrePort: containers.integreSQL.port,
              integreHost: containers.integreSQL.host
            })
            const existingHash = makeRandomHash()
            yield* client.createTemplate(existingHash)

            const result = yield* pipe(
              client.finalizeTemplate(existingHash),
              Effect.exit
            )

            expect(result).toStrictEqual<typeof result>(
              Exit.void
            )
          }),
          Effect.scoped
        ),
      1000 * 50
    )
  })
})

const makeRandomHash = () =>
  crypto
    .createHash("sha1")
    .update(randomUUID())
    .digest("hex") as DatabaseTemplateId
