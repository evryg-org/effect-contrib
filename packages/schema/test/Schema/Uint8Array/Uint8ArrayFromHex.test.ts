import * as S from "@effect/schema/Schema"
import * as Util from "@effect/schema/test/TestUtils"
import { describe, it } from "vitest"

describe("Uint8ArrayFromHex", () => {
  const schema = S.Uint8ArrayFromHex
  const encoder = new TextEncoder()

  it("property tests", () => {
    Util.roundtrip(schema)
  })

  it("decoding", async () => {
    await Util.expectDecodeUnknownSuccess(
      schema,
      "0001020304050607",
      Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7])
    )
    await Util.expectDecodeUnknownSuccess(
      schema,
      "f0f1f2f3f4f5f6f7",
      Uint8Array.from([0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7])
    )
    await Util.expectDecodeUnknownSuccess(
      schema,
      "67",
      encoder.encode("g")
    )
    await Util.expectDecodeUnknownFailure(
      schema,
      "0",
      `Uint8ArrayFromHex
└─ Transformation process failure
   └─ Length must be a multiple of 2, but is 1`
    )
    await Util.expectDecodeUnknownFailure(
      schema,
      "zd4aa",
      `Uint8ArrayFromHex
└─ Transformation process failure
   └─ Length must be a multiple of 2, but is 5`
    )
    await Util.expectDecodeUnknownFailure(
      schema,
      "0\x01",
      `Uint8ArrayFromHex
└─ Transformation process failure
   └─ Invalid input`
    )
  })

  it("encoding", async () => {
    await Util.expectEncodeSuccess(
      schema,
      Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
      "0001020304050607"
    )
  })
})
