---
"@evryg/effect-op-graph": minor
---

GraphOp strings must be well-formed Unicode

A label, a property name and every string property value (including the strings in a list) must hold no lone UTF-16 surrogate, so constructing or decoding a `GraphOp`, `VertexRef` or `PropertyMap` with one now fails. A UTF-8 transport such as Bolt carries every lone surrogate as U+FFFD, so `"\uD800"` and `"\uDC00"` reached the store as the same value, and two distinct identities merged silently. The new `WellFormedString` and `PropertyValue` schemas state the rule.

The `@evryg/effect-op-graph/contract/laws` suite draws its strings from `WellFormedString`, so a materializer that stores strings as UTF-8 no longer fails P10 on a draw whose two ids differ only in their lone surrogates. Each law now runs through `it.effect.prop`: a failure reports its shrunk draw and a replay token, which carries the seed. The `samples` argument is the number of runs per law.
