import { describe, expect, it } from "@effect/vitest"
import { Result, Schema, SchemaAST } from "effect"
import { DeclaredVertex } from "./DeclaredVertex.js"

describe("DeclaredVertex", () => {
  it("holds an object declaration and refuses any other schema", () => {
    const declaring = (declaration: SchemaAST.AST) =>
      Schema.decodeUnknownResult(DeclaredVertex)({
        label: "Alpha",
        rank: { owner: "synthetic/alpha", ordinal: 0 },
        declaration
      })
    expect(Result.isSuccess(declaring(Schema.Struct({ id: Schema.String }).ast))).toBe(true)
    expect(Result.isFailure(declaring(SchemaAST.string))).toBe(true)
  })
})
