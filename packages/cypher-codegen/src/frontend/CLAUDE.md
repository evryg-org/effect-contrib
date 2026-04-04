# Cypher Type Checker — Type Theory Foundations

## CypherType Lattice

The type system forms a lattice with `NeverType` as bottom and `UnknownType` as top:

```
        UnknownType (escape hatch — codegen emits Neo4jValue)
       /    |    \
  Scalar  List  Map  Vertex  Edge  Nullable
       \    |    /
        NeverType (bottom — no valid inhabitant)
```

- **NeverType** (`_tag: "NeverType"`): The bottom type, written `_`. Has no inhabitants. Arises from `NULL` literals and empty list literals (`[]`). In codegen, `Schema.Never` — no valid value can inhabit this type, so it signals "needs more info" rather than a real result type.
- **UnknownType** (`_tag: "UnknownType"`): Escape hatch when inference cannot determine a type. Codegen emits `Neo4jValue`. Should be avoided — prefer throwing `CypherTypeError` over returning `UnknownType`.

## Typing Rules

### Property access: `node.prop`

```
env(x) = VertexType(L)    schema(L, p) = (T, mandatory)
----------------------------------------------------------
  x.p : T                  if mandatory
  x.p : NullableType(T)    if not mandatory
```

Same rule applies for `EdgeType` via `lookupEdgePropertyType`.

If `env(x).nullable = true`, the entire result is wrapped in `NullableType` regardless of `mandatory`.

### Functions

| Function                            | Rule                                              |
| ----------------------------------- | ------------------------------------------------- |
| `collect(e)`                        | `List<strip_nullable(infer(e))>`                  |
| `coalesce(e, ...)`                  | `strip_nullable(infer(e))`                        |
| `count(*)`, `sum`, `size`, `length` | `Long`                                            |
| `avg`                               | `Nullable(Double)` — null on empty input set      |
| `min`, `max`                        | `Nullable(Long)` — null on empty input set        |
| `toFloat`                           | `Double`                                          |
| `toString`                          | `String`                                          |
| `type(r)`                           | `String`                                          |
| `keys(x)`, `labels(x)`              | `List<String>`                                    |
| `properties(x)`                     | `Map<[]>` (empty map — fields unknown statically) |

### CASE expression

```
CASE [expr] WHEN cond THEN result [ELSE alt] END
```

Type is inferred from the first THEN branch. If the WHEN clause is `var IS NOT NULL`, the variable is narrowed to non-nullable in the THEN branch environment.

### List comprehension

```
[x IN list | body]      => List<infer(body, env + {x: elem(list)})>
[x IN list WHERE pred]  => List<elem(list)>
```

### REDUCE (fold)

```
reduce(acc = init, x IN list | body)
```

Type theory: `fold : (B -> A -> B) -> B -> List<A> -> B`

1. Infer `init` type -> bind `acc` in env
2. Infer `list` type -> extract element type -> bind `x` in env
3. Infer `body` type with both bindings -> this IS the return type

Example: `reduce(s = [], ps IN listOfStringLists | s + [p IN ps WHERE ...])`:

- `s: List<NeverType>`, `ps: List<String>`
- body: `s + [p IN ps WHERE ...]` = `List<NeverType> + List<String>` = `List<String>`
- Result: `List<String>`

### The `+` operator on lists

List concatenation follows the join rule on element types:

```
List<A> + List<B> = List<A V B>
```

Where `V` is the join (least upper bound) in the type lattice. Special case: `NeverType` is the identity element:

```
List<NeverType> + List<T> = List<NeverType V T> = List<T>
```

This is why `[] + someList` correctly infers the element type of `someList`.

### filterWith (ANY/ALL/NONE/SINGLE)

```
any(x IN list WHERE pred)  => Boolean
all(x IN list WHERE pred)  => Boolean
none(x IN list WHERE pred) => Boolean
single(x IN list WHERE pred) => Boolean
```

Always returns `Boolean` regardless of the list element type.

## NeverType and Codegen

When `NeverType` appears in a final codegen type:

- `Schema.Never` — signals an error in inference (no valid type could be determined)
- In `ListType(NeverType)`: an empty list with unknown element type — should be joined with a concrete type via `+` or similar

## When to throw CypherTypeError vs return a type

**Throw** when:

- Property not found on a label/edge type (schema violation)
- Property access on non-vertex/non-edge type
- Unbound variable
- Unrecognized function
- Structural errors (missing THEN branch, etc.)

**Return a type** when:

- The construct has valid semantics even if imprecise (e.g., `UnknownType` for truly unknowable types)
- `NeverType` for NULL/empty-list (these compose correctly via join)
