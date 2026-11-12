import { describe, expect, it } from "@effect/vitest"
import { Arbitrary } from "effect"

interface BinaryOperation<A> {
  readonly name: string
  readonly arb: Arbitrary.Arbitrary<A>
  readonly op: (a: A, b: A) => A
  readonly eq: (a: A, b: A) => void
}

export const associativityLaw = <A>({ arb, eq, name, op }: BinaryOperation<A>): void => {
  describe(`Associativity: ${name}`, () => {
    it.prop("op(op(a, b), c) = op(a, op(b, c))", [arb, arb, arb], ([a, b, c]) => {
      eq(op(op(a, b), c), op(a, op(b, c)))
    })
  })
}

export const commutativityLaw = <A>({ arb, eq, name, op }: BinaryOperation<A>): void => {
  describe(`Commutativity: ${name}`, () => {
    it.prop("op(a, b) = op(b, a)", [arb, arb], ([a, b]) => {
      eq(op(a, b), op(b, a))
    })
  })
}

export const binaryIdempotenceLaw = <A>({ arb, eq, name, op }: BinaryOperation<A>): void => {
  describe(`Binary Idempotence: ${name}`, () => {
    it.prop("op(a, a) = a", [arb], ([a]) => {
      eq(op(a, a), a)
    })
  })
}

export const leftIdentityLaw = <A>({ arb, eq, id, name, op }: BinaryOperation<A> & { readonly id: A }): void => {
  describe(`Left Identity: ${name}`, () => {
    it.prop("op(id, a) = a", [arb], ([a]) => {
      eq(op(id, a), a)
    })
  })
}

export const rightIdentityLaw = <A>({ arb, eq, id, name, op }: BinaryOperation<A> & { readonly id: A }): void => {
  describe(`Right Identity: ${name}`, () => {
    it.prop("op(a, id) = a", [arb], ([a]) => {
      eq(op(a, id), a)
    })
  })
}

export const boundedSemilatticeLaws = <A>(opts: BinaryOperation<A> & { readonly id: A }): void => {
  associativityLaw(opts)
  binaryIdempotenceLaw(opts)
  commutativityLaw(opts)
  leftIdentityLaw(opts)
  rightIdentityLaw(opts)
}

export const leftAnnihilationLaw = <A>(
  { arb, eq, name, op, zero }: BinaryOperation<A> & { readonly zero: A }
): void => {
  describe(`Left Annihilation: ${name}`, () => {
    it.prop("op(zero, a) = zero", [arb], ([a]) => {
      eq(op(zero, a), zero)
    })
  })
}

export const rightAnnihilationLaw = <A>(
  { arb, eq, name, op, zero }: BinaryOperation<A> & { readonly zero: A }
): void => {
  describe(`Right Annihilation: ${name}`, () => {
    it.prop("op(a, zero) = zero", [arb], ([a]) => {
      eq(op(a, zero), zero)
    })
  })
}

export const homomorphismLaw = <A, B>({ arb, eq, h, name, opA, opB }: {
  readonly name: string
  readonly arb: Arbitrary.Arbitrary<A>
  readonly h: (a: A) => B
  readonly opA: (a: A, b: A) => A
  readonly opB: (a: B, b: B) => B
  readonly eq: (a: B, b: B) => void
}): void => {
  describe(`Homomorphism: ${name}`, () => {
    it.prop("h(opA(a, b)) = opB(h(a), h(b))", [arb, arb], ([a, b]) => {
      eq(h(opA(a, b)), opB(h(a), h(b)))
    })
  })
}

// Nothing is drawn: both identities are fixed, so one check states the law.
export const identityPreservingLaw = <A, B>({ eq, h, idA, idB, name }: {
  readonly name: string
  readonly h: (a: A) => B
  readonly idA: A
  readonly idB: B
  readonly eq: (a: B, b: B) => void
}): void => {
  describe(`Identity-preserving: ${name}`, () => {
    it("h(idA) = idB", () => {
      eq(h(idA), idB)
    })
  })
}

export const confluenceLaw = <S, A>({ arbAction, arbState, eq, name, step }: {
  readonly name: string
  readonly arbState: Arbitrary.Arbitrary<S>
  readonly arbAction: Arbitrary.Arbitrary<A>
  readonly step: (s: S, a: A) => S
  readonly eq: (a: S, b: S) => void
}): void => {
  describe(`Confluence: ${name}`, () => {
    it.prop("step(step(s, a1), a2) = step(step(s, a2), a1)", [arbState, arbAction, arbAction], ([s, a1, a2]) => {
      eq(step(step(s, a1), a2), step(step(s, a2), a1))
    })
  })
}

export const simulationLaw = <SC, SA, A>({ abs, arbAction, arbState, eq, name, stepAbstract, stepConcrete }: {
  readonly name: string
  readonly arbState: Arbitrary.Arbitrary<SC>
  readonly arbAction: Arbitrary.Arbitrary<A>
  readonly stepConcrete: (s: SC, a: A) => SC
  readonly stepAbstract: (s: SA, a: A) => SA
  readonly abs: (s: SC) => SA
  readonly eq: (a: SA, b: SA) => void
}): void => {
  describe(`Simulation: ${name}`, () => {
    it.prop("abs(stepConcrete(s, a)) = stepAbstract(abs(s), a)", [arbState, arbAction], ([s, a]) => {
      eq(abs(stepConcrete(s, a)), stepAbstract(abs(s), a))
    })
  })
}

// The premise inv(s) is a precondition: only states satisfying it are drawn.
export const invariantPreservationLaw = <S, A>({ arbAction, arbState, inv, name, step }: {
  readonly name: string
  readonly arbState: Arbitrary.Arbitrary<S>
  readonly arbAction: Arbitrary.Arbitrary<A>
  readonly inv: (s: S) => boolean
  readonly step: (s: S, a: A) => S
}): void => {
  describe(`Invariant Preservation: ${name}`, () => {
    it.prop("∀s. inv(s) ⟹ ∀a. inv(step(s, a))", [arbState.pipe(Arbitrary.filter(inv)), arbAction], ([s, a]) => {
      expect(inv(step(s, a))).toBe(true)
    })
  })
}
