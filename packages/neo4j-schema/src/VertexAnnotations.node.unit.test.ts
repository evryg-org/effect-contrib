import { describe, expect, it } from "@effect/vitest"
import { HashMap, Option, Result, Schema } from "effect"
import { VertexLabel } from "./GraphVocabulary.js"
import { VertexAnnotations } from "./VertexAnnotations.js"

describe("VertexAnnotations.schema", () => {
  it("decodes annotations by decoding each label's annotation", () => {
    const encoded = new VertexAnnotations(HashMap.make([VertexLabel.make("Alpha"), "1"]))
    const decoded = Result.getOrThrow(
      Schema.decodeUnknownResult(VertexAnnotations.schema(Schema.NumberFromString))(encoded)
    )
    expect(decoded.annotationOf(VertexLabel.make("Alpha"))).toEqual(Option.some(1))
  })

  it("refuses anything but annotations, naming what it expected", () => {
    const decoded = Schema.decodeUnknownResult(VertexAnnotations.schema(Schema.String))({ Alpha: "red" })
    expect(Result.match(decoded, { onFailure: (error) => error.message, onSuccess: () => "" })).toBe(
      "Expected VertexAnnotations, got {\"Alpha\":\"red\"}"
    )
  })
})
