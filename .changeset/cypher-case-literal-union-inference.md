---
"@evryg/effect-cypher-codegen": patch
---

Infer a literal union for a `CASE` whose arms are all string literals.

A `CASE` such as `CASE x WHEN 'a' THEN 'Pending' WHEN 'b' THEN 'Confirmed' ELSE 'Unknown' END` widened
to `Schema.String`, discarding the literal set. It now synthesizes `Schema.Literals(["Pending",
"Confirmed", "Unknown"])` (or `Schema.Literal(...)` for a single value). This composes with the
existing `CASE`/`coalesce` join rather than special-casing it: a string literal now types as a
singleton, a nested `CASE` in an arm flattens into the same union, a `null` arm or an absent `ELSE`
makes the union nullable, and any arm that isn't itself a string literal (a property, a function call,
a parameter) makes the whole `CASE` fall back to `Schema.String` as before — narrowing only holds when
every candidate value is known statically. Numeric and boolean literals are unaffected.
