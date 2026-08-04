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
| `log`, `log10`, `exp`, `sqrt`, `ceil`, `floor`, `round`, `sin`, `cos`, `tan`, `cot`, `asin`, `acos`, `atan`, `atan2`, `degrees`, `radians`, `haversine`, `e()`, `pi()`, `rand()` | `Double` (Neo4j math functions return Float regardless of argument type) |
| `sign(x)`                           | `Long`                                            |
| `abs(x)`                            | `strip_nullable(infer(x))` — input-preserving (`abs(Long)=Long`, `abs(Double)=Double`) |

### CASE expression

```
CASE [scrutinee] (WHEN cᵢ THEN tᵢ)+ [ELSE e] END
```

Every result branch is typed — all n `THEN`s plus the `ELSE` — and the branches are joined into one
column type:

```
branches = t₁ … tₙ, (e | NeverType)        -- an absent ELSE contributes NeverType
payload  = ⊔ᵢ strip(bᵢ)                    -- NeverType is the join identity
nullable = ∃i. bᵢ : Nullable(_)  ∨  ∃i. bᵢ : NeverType
------------------------------------------------------
CASE … END : Nullable(payload)   if nullable
CASE … END : payload             otherwise
```

An absent `ELSE` is treated as `ELSE null`, because Cypher yields null when no `WHEN` matches — one
mechanism rather than a special case: a `NULL` literal branch is `NeverType`, which contributes
nullability without contributing a payload. If every branch is null the payload has no inhabitant and
the bare `NeverType` is returned.

`⊔` is the **coalesce** lattice (`unifyCandidateTypes`), not the arithmetic one: a CASE column is one
decoder over several candidate values, exactly like `coalesce`, so mixed numerics widen to the
integer-tolerant `Long` rather than to `Double`. A genuine disagreement such as String vs. Long has
no representable answer and keeps the leading branch's type — never `UnknownType`, never a union.

Each branch is typed under **its own** `WHEN`: if `cᵢ` is `var IS NOT NULL`, that variable is narrowed
to non-nullable in `tᵢ`'s environment only. A structurally malformed CASE (a `THEN` with no result
expression) throws `CypherTypeError`.

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

### Numeric arithmetic operators (`+ - * / % ^`)

Numeric operands unify by the join on the numeric scalars, where `Double` is the upper bound:

```
Long ⊔ Long   = Long
Long ⊔ Double = Double
```

A `Double` operand anywhere in an expression — at any operator level — widens the whole result to
`Double` (`l * d`, `l / d`, `d + l` all infer `Double`). With only `Long` operands the result stays
`Long`, matching Cypher integer arithmetic (`Long / Long → Long`, `Long % Long → Long`).
Exponentiation `^` always yields `Double` for numeric operands (Cypher power returns Float).

Non-numeric arithmetic (dates, durations) is left unchanged: when operands aren't all numeric
scalars the result keeps the leading operand's type. String operands make `+` a String
concatenation (see above), and list operands make `+` a list concatenation.

Numeric **literals** carry their int/float distinction: `1.5`, `1e3`, and float-suffixed literals
infer `Double`; plain integers infer `Long`. So `priceLong * 1.5` correctly infers `Double`.

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
