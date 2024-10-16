import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Option, pipe } from "effect"
import { randomUUID } from "node:crypto"
import { inject } from "vitest"
import {
  DatabaseConfiguration,
  IntegreSqlFailedToCreateTemplate,
  makeIntegreSqlClient,
  NoSuchTemplate,
  unsafeMakeDatabaseTemplateId
} from "../src/IntegreSqlClient.js"

describe(`IntegreSqlClient`, () => {
  describe("createTemplate", () => {
    it.effect(
      `Creating a template returns the template database connection settings`,
      () =>
        Effect.gen(function*() {
          const containers = inject("containers")
          const client = makeIntegreSqlClient({ url: containers.integreAPIUrl })
          const hash = makeRandomHash()

          const result = yield* client.createTemplate(hash)

          expect(result).toStrictEqual<typeof result>(
            Option.some(expect.any(DatabaseConfiguration))
          )
        })
    )

    it.effect(
      `Creating an already existing template does nothing`,
      () =>
        Effect.gen(function*() {
          const containers = inject("containers")
          const client = makeIntegreSqlClient({ url: containers.integreAPIUrl })
          const hash = makeRandomHash()
          yield* client.createTemplate(hash)

          const result = yield* client.createTemplate(hash)

          expect(result).toStrictEqual<typeof result>(Option.none())
        })
    )

    it.effect(
      `IntegreSQL not running dies`,
      () =>
        Effect.gen(function*() {
          const client = makeIntegreSqlClient({ url: "http://localhost:1111" })
          const hash = makeRandomHash()

          const result = yield* pipe(
            client.createTemplate(hash),
            Effect.exit
          )

          expect(result).toStrictEqual<typeof result>(
            Exit.die(expect.any(IntegreSqlFailedToCreateTemplate))
          )
        })
    )
  })

  describe("finalizeTemplate", () => {
    it.effect(
      `Non-existing template fails with NoSuchTemplate`,
      () =>
        Effect.gen(function*() {
          const containers = inject("containers")
          const client = makeIntegreSqlClient({ url: containers.integreAPIUrl })
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
        })
    )

    it.effect(
      `Non finalized template succeeds`,
      () =>
        Effect.gen(function*() {
          const containers = inject("containers")
          const client = makeIntegreSqlClient({ url: containers.integreAPIUrl })
          const existingHash = makeRandomHash()
          yield* client.createTemplate(existingHash)

          const result = yield* pipe(
            client.finalizeTemplate(existingHash),
            Effect.exit
          )

          expect(result).toStrictEqual<typeof result>(
            Exit.void
          )
        })
    )

    it.effect(
      `Template already finalized`,
      () =>
        Effect.gen(function*() {
          const containers = inject("containers")
          const client = makeIntegreSqlClient({ url: containers.integreAPIUrl })
          const existingHash = makeRandomHash()
          yield* client.createTemplate(existingHash)
          yield* client.finalizeTemplate(existingHash)

          const result = yield* pipe(
            client.finalizeTemplate(existingHash),
            Effect.exit
          )

          expect(result).toStrictEqual<typeof result>(
            Exit.void
          )
        })
    )
  })

  describe("getNewTestDatabase", () => {
    it.effect(
      `No matching template returns nothing`,
      () =>
        Effect.gen(function*() {
          const containers = inject("containers")
          const client = makeIntegreSqlClient({ url: containers.integreAPIUrl })
          const existingHash = makeRandomHash()
          const nonExistingHash = makeRandomHash()
          yield* client.createTemplate(existingHash)
          yield* client.finalizeTemplate(existingHash)

          const result = yield* client.getNewTestDatabase(nonExistingHash)

          expect(result).toStrictEqual<typeof result>(Option.none())
        })
    )

    it.effect(
      `Returns test database connection settings`,
      () =>
        Effect.gen(function*() {
          const containers = inject("containers")
          const client = makeIntegreSqlClient({ url: containers.integreAPIUrl })
          const hash = makeRandomHash()
          yield* client.createTemplate(hash)
          yield* client.finalizeTemplate(hash)

          const result = yield* client.getNewTestDatabase(hash)

          expect(result).toStrictEqual<typeof result>(
            Option.some(
              new DatabaseConfiguration({
                host: expect.any(String),
                port: expect.any(Number),
                username: expect.any(String),
                password: expect.any(String),
                database: expect.any(String)
              })
            )
          )
        })
    )
  })
})

const makeRandomHash = () => unsafeMakeDatabaseTemplateId(randomUUID())
