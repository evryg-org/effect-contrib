---
"@evryg/effect-bdd": patch
---

Add an implementation-independent BDD vocabulary with typed Given, When, and Then descriptors, ordered fluent and pipe builders, and reusable step fragments. Every fluent prefix is immutable scenario data that can be rendered, inspected, grouped, filtered, and run under multiple interpreters.

Separate Effect bindings from authoring, preserve each operation's result/error/service requirements, and merge named context patches with replacement semantics. Runs allocate independent worlds, observations, and scopes; capture synchronous implementation throws and complete causes; and require domain failures to be acknowledged by matching failure assertions. Export explicit `/effect`, `/vitest`, and `/effect-vitest` integrations.
