# Litholang Language Improvements Brainstorm

## Context

Litholang is a compile-to-TypeScript language with English-like keywords, `keyword...end` blocks, typed boundaries, and errors-as-values semantics. The compiler pipeline (lexer → parser → type checker → emitter) is solid for core features. This brainstorm identifies improvements that would make the language more expressive, safer, and more pleasant to use — while staying true to its design principles of explicit intent, flat scope, and uniform blocks.

---

## 1. Type System Enhancements

### 1a. Exhaustive match checking
**What:** Warn when a `match` on an enum doesn't cover all variants (missing wildcard or explicit cases).
**Why:** Prevents silent bugs when new enum variants are added. Core to "errors as values" philosophy.
**Effort:** Medium · **Impact:** High
**Files:** `src/typechecker/typechecker.ts` (add exhaustiveness pass after `MatchStatement` checking)

### 1b. Generic type bounds / constraints
**What:** Allow constraining generic type parameters.
```
define sort<T: Comparable>(items: List<T>) -> List<T> as ... end
```
**Why:** Prevents calling functions with incompatible types. Enables safer generic code.
**Effort:** Large · **Impact:** Medium

### 1c. Union types (sum types beyond enums)
**What:** Allow inline union types for function parameters and returns.
```
type StringOrNumber is Text | Number
define format(value: Text | Number) -> Text as ... end
```
**Why:** Many real-world APIs accept multiple types. Currently requires separate functions or `unknown`.
**Effort:** Medium · **Impact:** Medium
**Files:** `src/parser/ast.ts` (add `UnionType` node), `src/typechecker/typechecker.ts`, `src/emitter/typescript.ts`

### 1d. Enum variants with associated data (tagged unions)
**What:** Allow enum variants to carry payloads, turning enums into proper algebraic data types.
```
enum Shape is
  Circle(radius: Number)
  Rectangle(width: Number, height: Number)
  Point
end
```
**Why:** Enables modeling complex domain data without separate structs per variant. Works naturally with `match`.
**Effort:** Large · **Impact:** High
**Files:** `src/parser/ast.ts` (`EnumDef` variants become richer), parser, type checker, emitter all need updates

### 1e. Interface / trait system
**What:** Define shared behavior contracts that structs can implement.
```
trait Printable has
  define show(self) -> Text
end

struct User has
  name: Text
is Printable
  define show(self) -> Text as
    return self.name
  end
end
```
**Why:** Enables polymorphism without inheritance. Fits the "explicit intent" philosophy.
**Effort:** Large · **Impact:** High

---

## 2. Pattern Matching & Control Flow

### 2a. Pattern guards
**What:** Add `where` conditions to match cases.
```
match age on
  case n where n >= 18 => "adult"
  case n where n >= 13 => "teen"
  case _ => "child"
end
```
**Why:** Avoids nested `if` inside match arms. Keeps code flat per design principles.
**Effort:** Small · **Impact:** High
**Files:** `src/parser/ast.ts` (add `guard` to `MatchCase`), `src/parser/parser.ts`, `src/emitter/typescript.ts`

### 2b. Or-patterns
**What:** Match multiple patterns with the same arm.
```
match status on
  case "active" | "pending" => handle_open()
  case "closed" | "archived" => handle_done()
end
```
**Why:** Reduces duplicated match arms. Common pattern in real code.
**Effort:** Small · **Impact:** Medium
**Files:** `src/parser/ast.ts` (add `OrPattern`), parser, emitter

### 2c. Destructuring patterns for structs
**What:** Destructure struct fields directly in match cases.
```
match user on
  case User { name: n, age: a } where a > 18 => greet(n)
  case _ => "unknown"
end
```
**Why:** Avoids intermediate variable assignments. Natural for data-oriented code.
**Effort:** Medium · **Impact:** Medium

### 2d. List/array patterns
**What:** Destructure lists in patterns.
```
match items on
  case [] => "empty"
  case [first, ...rest] => process(first, rest)
end
```
**Why:** Essential for recursive list processing. Works well with `@tailrec`.
**Effort:** Medium · **Impact:** Medium

### 2e. `while` loops via `repeat...end`
**What:** Add a loop construct for condition-based repetition.
```
repeat while condition do
  ...
end
```
**Why:** Currently must use `@tailrec` or `for` for all loops. `repeat` is more explicit for condition-based loops and keeps the English-like keyword style.
**Effort:** Small · **Impact:** Medium

---

## 3. Pipeline & Functional Programming

### 3a. Standard pipeline functions (built-in)
**What:** Define built-in collection operations that pipelines can use: `filter`, `map`, `reduce`, `flat_map`, `take`, `skip`, `sort`, `group_by`, `find`, `any`, `all_of`, `none_of`, `zip`, `enumerate`.
**Why:** Pipeline syntax exists but the functions it calls aren't defined. Examples use them but they'd error at runtime.
**Effort:** Medium · **Impact:** High
**Approach:** Could be a prelude of extern definitions that map to JS Array methods, or built-in functions recognized by the type checker.

### 3b. Pipeline-aware type inference
**What:** Infer types flowing through pipeline steps so the type checker can validate them.
```
-- Type checker knows: List<User> → filter → List<User> → map → List<Text>
users |> filter(where .active) |> map(each u => u.name)
```
**Why:** Currently all pipeline expressions return `unknown`. This is the biggest type safety gap.
**Effort:** Large · **Impact:** High
**Files:** `src/typechecker/typechecker.ts` (`PipelineExpr` inference)

### 3c. Partial application / currying
**What:** Allow partial function application in pipelines.
```
numbers |> map(add(1))        -- partial application
numbers |> filter(greater_than(5))
```
**Why:** Makes pipelines more composable without writing lambdas everywhere.
**Effort:** Medium · **Impact:** Medium

### 3d. Comprehensions
**What:** List/map comprehensions as expressions.
```
squares = [x * x for x in range(10) where x > 3]
lookup = {user.id: user.name for user in users}
```
**Why:** More concise than `|> filter |> map |> collect` for simple transformations.
**Effort:** Medium · **Impact:** Medium

---

## 4. Module System & Visibility

### 4a. Visibility modifiers
**What:** Control what's exported from a module.
```
-- Only exported declarations are visible to importers
define public greet(name: Text) -> Text as ... end
define private helper(x: Number) -> Number as ... end
```
Or use `export` keyword:
```
export define greet(name: Text) -> Text as ... end
```
**Why:** Encapsulation is essential for larger codebases. Aligns with "explicit intent."
**Effort:** Small · **Impact:** Medium
**Files:** Add `isPublic`/`isExported` flag to declaration AST nodes, emit accordingly

### 4b. Relative imports
**What:** Support importing from local Litho modules.
```
import UserService from "./services/user"
import { validate, sanitize } from "./utils/input"
```
**Why:** Currently imports are opaque strings with no module resolution. Multi-file projects need this.
**Effort:** Medium · **Impact:** High

### 4c. Selective imports
**What:** Import specific names from a module.
```
import { map, filter } from "collections"
```
**Why:** Avoids namespace pollution. Currently imports bring everything.
**Effort:** Small · **Impact:** Medium
**Note:** Parser already supports `names: string[]` in `ImportDecl` — just needs emitter support.

---

## 5. Error Handling Improvements

### 5a. `try...rescue...end` blocks
**What:** Structured error recovery for sections of code.
```
try
  data = fetch_data()?
  parsed = parse(data)?
  return ok(parsed)
rescue error
  return err("Failed: {error}")
end
```
**Why:** Multiple `?` propagations sometimes need unified recovery. More ergonomic than wrapping each call.
**Effort:** Medium · **Impact:** Medium

### 5b. `ok()` and `err()` constructors as built-ins
**What:** Built-in functions to construct `Result` values.
```
return ok(value)    -- { ok: true, value: value }
return err("oops")  -- { ok: false, error: "oops" }
```
**Why:** Currently no standard way to construct `Result` values in Litho code.
**Effort:** Small · **Impact:** High

### 5c. `some()` and `none` constructors for Maybe
**What:** Built-in constructors for `Maybe<T>`.
```
return some(user)   -- user
return none         -- null
```
**Why:** Makes working with `Maybe<T>` explicit. Reads naturally.
**Effort:** Small · **Impact:** Medium

### 5d. `or_else` / `unwrap_or` chaining
**What:** Methods/pipeline steps for fallback values on Result/Maybe.
```
name = get_user()? |> or_else("Anonymous")
config = load_config() |> unwrap_or(default_config)
```
**Why:** Common pattern for providing defaults. Avoids match boilerplate.
**Effort:** Small · **Impact:** Medium

---

## 6. Developer Experience & Tooling

### 6a. Implement `litho fmt` formatter
**What:** Auto-format Litho source code. CLI already declares the command but prints "not yet implemented."
**Why:** Consistency across codebases. Essential for team adoption and LLM-generated code.
**Effort:** Medium · **Impact:** High
**Files:** New `src/formatter/` module, update `src/cli.ts`

### 6b. Better error messages with code context
**What:** Show source code snippets, underline the error location, and suggest fixes.
```
Error: Return type mismatch in 'processUser'
  --> src/handlers.litho:15:3
   |
15 |   return count
   |          ^^^^^ expected Text, got Number
   |
   = hint: did you mean `to_text(count)`?
```
**Why:** Current errors are bare strings with line/column. Hard to debug in larger files.
**Effort:** Medium · **Impact:** High
**Files:** `src/typechecker/typechecker.ts`, `src/cli.ts`

### 6c. Language Server Protocol (LSP)
**What:** Build an LSP server for IDE integration (hover types, go-to-definition, completions, diagnostics).
**Why:** Modern language adoption requires good editor support.
**Effort:** Large · **Impact:** High

### 6d. REPL / playground
**What:** Interactive evaluation loop for experimenting with Litho expressions.
```
$ litho repl
litho> 1 + 2
3
litho> [1, 2, 3] |> map(each x => x * 2)
[2, 4, 6]
```
**Why:** Lowers barrier to learning. Great for prototyping.
**Effort:** Medium · **Impact:** Medium

### 6e. Watch mode in CLI
**What:** `litho watch <file>` — recompile on file change.
**Why:** Faster development iteration.
**Effort:** Small · **Impact:** Medium

---

## 7. Syntax Sugar & Ergonomics

### 7a. Named arguments at call sites (actual emission)
**What:** Emit named arguments properly instead of as comments.
```
create_user(name: "Alice", age: 30)  -- currently emitted as positional
```
**Why:** Named args are already parsed but ignored in emission. This is a quick win.
**Effort:** Small · **Impact:** Medium
**Files:** `src/emitter/typescript.ts` (`emitCallExpr`)

### 7b. String interpolation type checking
**What:** Validate expressions inside `{...}` in string literals at type-check time.
**Why:** Currently interpolation expressions are only evaluated at emit time. Type errors slip through.
**Effort:** Small · **Impact:** Medium
**Files:** `src/typechecker/typechecker.ts` (check `TextLiteral` segments)

### 7c. Tuple type and tuple literals
**What:** First-class tuple support beyond match patterns.
```
type Point is (Number, Number)
origin = (0, 0)
(x, y) = get_position()
```
**Why:** Tuples are used in match patterns but can't be created as values. Inconsistent.
**Effort:** Medium · **Impact:** Medium

### 7d. Range expressions
**What:** `1..10` syntax for creating ranges.
```
for i in 1..10 do ... end
numbers = [1..100]
```
**Why:** Common need for iteration. Currently requires constructing lists manually.
**Effort:** Small · **Impact:** Medium

### 7e. Multi-line lambdas
**What:** Allow lambda bodies with multiple statements.
```
users |> map(each u =>
  name = u.first + " " + u.last
  return name
end)
```
**Why:** Currently lambdas are single-expression only. Limits pipeline complexity.
**Effort:** Medium · **Impact:** Medium

### 7f. Default struct field values
**What:** Allow defaults in struct definitions (already parsed, ensure emission works).
```
struct Config has
  timeout: Number = 30
  retries: Number = 3
  verbose: Boolean = false
end
```
**Why:** Parser supports `defaultValue` on `FieldDef`. Emitter may need to handle this.
**Effort:** Small · **Impact:** Medium

---

## 8. Standard Library & Runtime

### 8a. Prelude module with core functions
**What:** Ship a set of always-available functions: `print`, `to_text`, `to_number`, `length`, `range`, `ok`, `err`, `some`, `none`.
**Why:** Currently no built-in functions exist. Even basic I/O requires FFI.
**Effort:** Medium · **Impact:** High

### 8b. Collection module
**What:** `filter`, `map`, `reduce`, `flat_map`, `sort`, `group_by`, `find`, `zip`, `enumerate`, `take`, `skip` for `List<T>`.
**Why:** Pipelines need these to function. Currently syntax-only.
**Effort:** Medium · **Impact:** High

### 8c. Text utilities
**What:** `split`, `join`, `trim`, `starts_with`, `ends_with`, `replace`, `to_upper`, `to_lower`, `matches` (regex).
**Why:** String processing is fundamental. Currently requires FFI for everything.
**Effort:** Small · **Impact:** Medium

### 8d. Date/Time operations
**What:** Functions for `Duration`, `Date`, `Timestamp` types: `now()`, `add_duration`, `diff`, `format_date`.
**Why:** Types exist as built-ins but have zero functionality.
**Effort:** Medium · **Impact:** Medium

---

## Priority Ranking (Top 10)

| # | Improvement | Effort | Impact | Rationale |
|---|-------------|--------|--------|-----------|
| 1 | 5b. `ok()`/`err()` built-ins | Small | High | Unblocks idiomatic Result usage |
| 2 | 2a. Pattern guards | Small | High | High expressiveness, small change |
| 3 | 1a. Exhaustive match checking | Medium | High | Safety win for enums |
| 4 | 8a. Prelude module | Medium | High | Unblocks basic programs |
| 5 | 8b. Collection module | Medium | High | Makes pipelines actually work |
| 6 | 6a. Formatter | Medium | High | Essential tooling |
| 7 | 6b. Better error messages | Medium | High | DX win |
| 8 | 1d. Tagged union enums | Large | High | Unlocks algebraic data types |
| 9 | 3b. Pipeline type inference | Large | High | Biggest type safety gap |
| 10 | 7a. Named argument emission | Small | Medium | Quick win, already parsed |

---

## Verification

This is a brainstorm/design document — no code changes to verify. The improvements listed above should be validated by:
1. Discussing priorities with the language author
2. Prototyping the "Small effort" items first to test feasibility
3. Writing example `.litho` programs that exercise proposed features before implementing
4. Running `npm test` after each implementation to ensure no regressions
