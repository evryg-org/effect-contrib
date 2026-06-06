---
"@evryg/effect-cypher-codegen": patch
---

coalesce now accounts for fallback argument types when the leading argument is nullable. Previously the result type was the leading argument's type stripped of nullable, ignoring the fallbacks. When a nullable Double property is coalesced with an integer literal (`coalesce(n.score, 0)`), the runtime yields that integer literal as a database Integer when the property is null — which the Double decoder rejects. The result now widens to Long (the integer-tolerant numeric superset, which also passes floats through), so the emitted column decodes correctly. Same-type and non-nullable leading arguments are unaffected.
