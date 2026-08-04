---
"@evryg/effect-cypher-codegen": patch
---

Fix nullability and branch inference for Cypher `CASE` expressions.

A `CASE` took its type from the first `THEN` branch alone; later `THEN`s and the `ELSE` were parsed
and never visited. So `CASE WHEN … THEN c.name ELSE null END` generated `Schema.String`, and a `CASE`
with no `ELSE` did too — decoding a row where the column is null failed, even though Cypher yields
null when no `WHEN` matches. Every result branch is now typed and joined: a nullable branch, a `null`
literal branch, or an absent `ELSE` makes the column `Schema.NullOr(...)`. Mixed numeric branches
unify on the `coalesce` lattice (widening to the integer-tolerant `Long`) rather than the arithmetic
one, since a `CASE` column is one decoder over several candidate values. Each branch is also narrowed
under its own `WHEN` guard, so `WHEN a IS NOT NULL THEN a.x WHEN b IS NOT NULL THEN b.x` no longer
mis-types the second arm as nullable.
