---
"@evryg/effect-cypher-codegen": minor
---

`analyzeQuery` (and so `generate`) now checks every property access against the label it is read from, in every clause. Before, only RETURN and WITH projections were checked, so a query such as `MATCH (p:Person) WHERE p.salary = $salary RETURN p.name AS name` passed even though `Person` declares no `salary`. It now fails with the same `CypherTypeError` as a projection does (`Property 'salary' not found on label 'Person'`), and `generate` reports it as a `CypherCodegenError`.

The check now covers:

- WHERE, including after WITH and after CALL ... YIELD;
- SET, MERGE ... ON CREATE SET / ON MATCH SET, and REMOVE;
- ORDER BY, which also sees the projected aliases;
- UNWIND, CALL arguments, and CASE scrutinees and guards;
- pattern property maps `(p:Person {name: $name})` and `[r:ACTED_IN {role: $role}]` in MATCH, CREATE, MERGE and pattern predicates;
- the keys of `SET p = {...}` and `SET p += {...}`;
- elements bound by list comprehensions, `any`/`all`/`none`/`single`, `reduce`, FOREACH and pattern comprehensions;
- EXISTS { ... } and COUNT { ... } subqueries;
- every UNION branch, not only the first.

Accesses on unbound or unlabeled variables, and on parameter maps such as `(p:Person $props)` or `SET p += $props`, are still not checked.

A query that reads or writes a property its label does not declare now fails code generation. To fix it, declare the property in the graph schema, or correct the query.
