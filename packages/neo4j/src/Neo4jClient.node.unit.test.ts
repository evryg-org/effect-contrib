import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { Neo4jConnectionError, Neo4jQueryError } from "./Neo4jClient.js"

class MappedError {
  constructor(readonly message: string) {}
}

describe("Neo4jQueryError#message", () => {
  it("reports the cause's message when cause is an Error", () => {
    const error = new Neo4jQueryError({ cypher: "RETURN 1", cause: new Error("connection reset") })
    expect(error.message).toBe("connection reset")
  })

  it("stringifies the cause when cause is not an Error", () => {
    const error = new Neo4jQueryError({ cypher: "RETURN 1", cause: "syntax error" })
    expect(error.message).toBe("syntax error")
  })

  it("is a real Error whose message the standard Error surface exposes", () => {
    const error = new Neo4jQueryError({ cypher: "RETURN 1", cause: new Error("connection reset") })
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toBe("Neo4jQueryError: connection reset")
  })
})

describe("Neo4jConnectionError#message", () => {
  it("reports the cause's message when cause is an Error", () => {
    const error = new Neo4jConnectionError({ uri: "bolt://localhost:7687", cause: new Error("ECONNREFUSED") })
    expect(error.message).toBe("ECONNREFUSED")
  })

  it("stringifies the cause when cause is not an Error", () => {
    const error = new Neo4jConnectionError({ uri: "bolt://localhost:7687", cause: "refused" })
    expect(error.message).toBe("refused")
  })
})

describe("mapping a Neo4jQueryError with plain Effect.mapError", () => {
  it.effect("surfaces the cause's message with no local unwrapping", () =>
    Effect.gen(function*() {
      const queryError = new Neo4jQueryError({ cypher: "RETURN 1", cause: new Error("connection reset") })
      const result = yield* Effect.fail(queryError).pipe(
        Effect.mapError((error) => new MappedError(error.message)),
        Effect.exit
      )
      expect(result).toStrictEqual(Exit.fail(new MappedError("connection reset")))
    }))
})
