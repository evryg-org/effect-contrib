import { describe, expect, it } from "@effect/vitest"
import { FastCheck as fc } from "effect/testing"
import { Neo4jConnectionError, Neo4jQueryError } from "./Neo4jClient.js"

const law = <Ts extends Array<unknown>>(suite: string, statement: string, property: fc.IProperty<Ts>): void => {
  describe(suite, () => {
    it(statement, () => fc.assert(property))
  })
}

const errorClasses = [
  { name: "Neo4jQueryError", make: (cause: unknown) => new Neo4jQueryError({ cypher: "RETURN 1", cause }) },
  {
    name: "Neo4jConnectionError",
    make: (cause: unknown) => new Neo4jConnectionError({ uri: "bolt://localhost:7687", cause })
  }
] as const

const hostile = (): never => {
  throw new Error("hostile cause")
}

const hostileMethodKeys = ["toString", "valueOf", Symbol.toPrimitive] as const
const hostileGetterKeys = ["message", "code"] as const

// An object whose coercion hooks and/or `message`/`code` reads throw, with or without a prototype.
const arbHostileCause: fc.Arbitrary<object> = fc
  .tuple(
    fc.subarray([...hostileMethodKeys]),
    fc.subarray([...hostileGetterKeys]),
    fc.boolean()
  )
  .filter(([methods, getters]) => methods.length + getters.length > 0)
  .map(([methods, getters, nullPrototype]) => {
    const cause: object = nullPrototype ? Object.create(null) : {}
    for (const key of methods) Object.defineProperty(cause, key, { value: hostile })
    for (const key of getters) Object.defineProperty(cause, key, { get: hostile })
    const label = [...methods.map(String), ...getters].join(",")
    Object.defineProperty(cause, fc.toStringMethod, {
      value: () => `hostile(${label}, nullPrototype=${nullPrototype})`
    })
    return cause
  })

const arbAnyValue: fc.Arbitrary<unknown> = fc.anything({
  withNullPrototype: true,
  withBigInt: true,
  withBoxedValues: true,
  withDate: true,
  withMap: true,
  withSet: true,
  withSparseArray: true,
  withTypedArray: true
})

for (const { make, name } of errorClasses) {
  law(
    `Totality: ${name}#message`,
    "reading message never throws and yields a string, for any value as cause",
    fc.property(arbAnyValue, (cause) => {
      expect(typeof make(cause).message).toBe("string")
    })
  )
  law(
    `Totality: ${name}#message`,
    "reading message never throws and yields a string, for a cause whose coercion or fields throw",
    fc.property(arbHostileCause, (cause) => {
      expect(typeof make(cause).message).toBe("string")
    })
  )
}
