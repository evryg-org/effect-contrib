import { describe, expect, it } from "@effect/vitest"
import { FastCheck as fc } from "effect/testing"

const law = (suiteName: string, statement: string, property: fc.IProperty<any>): void => {
  describe(suiteName, () => {
    it(statement, () => {
      fc.assert(property)
    })
  })
}

interface BinaryOperation<A> {
  readonly name: string
  readonly arb: fc.Arbitrary<A>
  readonly op: (a: A, b: A) => A
  readonly eq: (a: A, b: A) => void
}

export const associativityLaw = <A>({ arb, eq, name, op }: BinaryOperation<A>): void =>
  law(
    `Associativity: ${name}`,
    "op(op(a, b), c) = op(a, op(b, c))",
    fc.property(arb, arb, arb, (a, b, c) => {
      eq(op(op(a, b), c), op(a, op(b, c)))
    })
  )

export const commutativityLaw = <A>({ arb, eq, name, op }: BinaryOperation<A>): void =>
  law(
    `Commutativity: ${name}`,
    "op(a, b) = op(b, a)",
    fc.property(arb, arb, (a, b) => {
      eq(op(a, b), op(b, a))
    })
  )

export const binaryIdempotenceLaw = <A>({ arb, eq, name, op }: BinaryOperation<A>): void =>
  law(
    `Binary Idempotence: ${name}`,
    "op(a, a) = a",
    fc.property(arb, (a) => {
      eq(op(a, a), a)
    })
  )

export const leftIdentityLaw = <A>({ arb, eq, id, name, op }: BinaryOperation<A> & { readonly id: A }): void =>
  law(
    `Left Identity: ${name}`,
    "op(id, a) = a",
    fc.property(arb, (a) => {
      eq(op(id, a), a)
    })
  )

export const rightIdentityLaw = <A>({ arb, eq, id, name, op }: BinaryOperation<A> & { readonly id: A }): void =>
  law(
    `Right Identity: ${name}`,
    "op(a, id) = a",
    fc.property(arb, (a) => {
      eq(op(a, id), a)
    })
  )

export const boundedSemilatticeLaws = <A>(opts: BinaryOperation<A> & { readonly id: A }): void => {
  associativityLaw(opts)
  binaryIdempotenceLaw(opts)
  commutativityLaw(opts)
  leftIdentityLaw(opts)
  rightIdentityLaw(opts)
}

export const leftAnnihilationLaw = <A>({ arb, eq, name, op, zero }: BinaryOperation<A> & { readonly zero: A }): void =>
  law(
    `Left Annihilation: ${name}`,
    "op(zero, a) = zero",
    fc.property(arb, (a) => {
      eq(op(zero, a), zero)
    })
  )

export const rightAnnihilationLaw = <A>({ arb, eq, name, op, zero }: BinaryOperation<A> & { readonly zero: A }): void =>
  law(
    `Right Annihilation: ${name}`,
    "op(a, zero) = zero",
    fc.property(arb, (a) => {
      eq(op(a, zero), zero)
    })
  )

export const homomorphismLaw = <A, B>({ arb, eq, h, name, opA, opB }: {
  readonly name: string
  readonly arb: fc.Arbitrary<A>
  readonly h: (a: A) => B
  readonly opA: (a: A, b: A) => A
  readonly opB: (a: B, b: B) => B
  readonly eq: (a: B, b: B) => void
}): void =>
  law(
    `Homomorphism: ${name}`,
    "h(opA(a, b)) = opB(h(a), h(b))",
    fc.property(arb, arb, (a, b) => {
      eq(h(opA(a, b)), opB(h(a), h(b)))
    })
  )

export const identityPreservingLaw = <A, B>({ eq, h, idA, idB, name }: {
  readonly name: string
  readonly h: (a: A) => B
  readonly idA: A
  readonly idB: B
  readonly eq: (a: B, b: B) => void
}): void =>
  law(
    `Identity-preserving: ${name}`,
    "h(idA) = idB",
    fc.property(fc.constant(null), () => {
      eq(h(idA), idB)
    })
  )

export const confluenceLaw = <S, A>({ arbAction, arbState, eq, name, step }: {
  readonly name: string
  readonly arbState: fc.Arbitrary<S>
  readonly arbAction: fc.Arbitrary<A>
  readonly step: (s: S, a: A) => S
  readonly eq: (a: S, b: S) => void
}): void =>
  law(
    `Confluence: ${name}`,
    "step(step(s, a1), a2) = step(step(s, a2), a1)",
    fc.property(arbState, arbAction, arbAction, (s, a1, a2) => {
      eq(step(step(s, a1), a2), step(step(s, a2), a1))
    })
  )

export const simulationLaw = <SC, SA, A>({ abs, arbAction, arbState, eq, name, stepAbstract, stepConcrete }: {
  readonly name: string
  readonly arbState: fc.Arbitrary<SC>
  readonly arbAction: fc.Arbitrary<A>
  readonly stepConcrete: (s: SC, a: A) => SC
  readonly stepAbstract: (s: SA, a: A) => SA
  readonly abs: (s: SC) => SA
  readonly eq: (a: SA, b: SA) => void
}): void =>
  law(
    `Simulation: ${name}`,
    "abs(stepConcrete(s, a)) = stepAbstract(abs(s), a)",
    fc.property(arbState, arbAction, (s, a) => {
      eq(abs(stepConcrete(s, a)), stepAbstract(abs(s), a))
    })
  )

export const invariantPreservationLaw = <S, A>({ arbAction, arbState, inv, name, step }: {
  readonly name: string
  readonly arbState: fc.Arbitrary<S>
  readonly arbAction: fc.Arbitrary<A>
  readonly inv: (s: S) => boolean
  readonly step: (s: S, a: A) => S
}): void =>
  law(
    `Invariant Preservation: ${name}`,
    "∀s. inv(s) ⟹ ∀a. inv(step(s, a))",
    fc.property(arbState, arbAction, (s, a) => {
      fc.pre(inv(s))
      expect(inv(step(s, a))).toBe(true)
    })
  )
