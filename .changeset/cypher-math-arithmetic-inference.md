---
"@evryg/effect-cypher-codegen": patch
---

Improve numeric type inference in the Cypher type checker.

- Recognize Neo4j scalar math functions. `log`, `log10`, `exp`, `sqrt`, the trigonometric
  functions, `ceil`, `floor`, `round`, `e()`, `pi()`, `rand()` and friends now infer `Double`;
  `sign` infers `Long`; and `abs` preserves its argument's numeric type. Previously any of these
  threw `Unrecognized function`, failing codegen for queries that projected a bare math call such as
  `RETURN log(x) AS weight`.
- Unify numeric operand types in arithmetic. Expressions previously took only the first operand's
  type, so `Long * Double` (or `priceLong * 1.5`) inferred `Long` — emitting `Neo4jInt` and risking
  a runtime decode failure on floats. Numeric arithmetic now unifies operands by the numeric join
  (`Long ⊔ Double = Double`), a `Double` anywhere widens the result, and exponentiation (`^`) yields
  `Double`. Numeric literals also carry their int/float distinction (`1.5`/`1e3` → `Double`). String
  and list concatenation are unaffected.
