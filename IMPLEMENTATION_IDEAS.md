# ClarityLang — Implementation Ideas

After a thorough exploration of the codebase, here are concrete implementation ideas ordered by impact and feasibility. Each builds naturally on the existing architecture.

---

## 1. String Interpolation

**What:** Support `"Hello, {name}!"` syntax in text literals.

**Why:** The lexer already tracks `segments` on `TextLiteral` tokens and has comments about interpolation, but no parsing of `{expr}` within strings exists. This is table-stakes for a practical language.

**Scope:**
- Lexer: scan `{` inside strings, lex inner expression tokens, produce interpolation segments
- Parser: parse interpolation segments into embedded expressions in `TextLiteral` AST nodes
- Type checker: validate interpolated expressions resolve to `Text` (or are coercible)
- Emitter: emit as TypeScript template literals (`` `Hello, ${name}!` ``)

**Estimated complexity:** Medium — touches all four compiler phases but each change is small.

---

## 2. Formatter (`clarity fmt`)

**What:** Implement the `fmt` CLI command that's currently stubbed as "not yet implemented."

**Why:** Code formatting is essential for any language that wants consistent codebases. The `keyword...end` block structure makes formatting straightforward compared to brace languages.

**Scope:**
- New file `src/formatter/formatter.ts`: walk the AST and pretty-print with consistent indentation
- Rules: 2-space indent per block level, blank line between top-level declarations, align `has`/`is` blocks
- Wire into CLI's existing `fmt` command branch

**Estimated complexity:** Medium — AST walking is well-established in the emitter, and the uniform block structure simplifies formatting rules considerably.

---

## 3. Map and Set Literal Syntax

**What:** Add literal syntax for `Map` and `Set` alongside the existing `List` literal `[...]`.

**Why:** Lists have literal syntax (`[1, 2, 3]`) but Maps and Sets require constructor calls. Adding `#{key: value}` for maps and `#[1, 2, 3]` for sets would make the language more ergonomic.

**Scope:**
- Lexer: add `#{` and `#[` as new token types
- Parser: parse map literals as key-value pairs, set literals as value lists
- AST: add `MapLiteral` and `SetLiteral` expression nodes
- Type checker: infer element/key/value types from contents
- Emitter: emit `new Map([["key", value]])` and `new Set([1, 2, 3])`

**Estimated complexity:** Medium — follows the exact same pattern as `ListLiteral` through all phases.

---

## 4. Destructuring in Assignments and Parameters

**What:** Allow `let (x, y) = get_point()` and `define process({name, age}: User)`.

**Why:** Pattern matching exists in `match` statements but not in assignments or function parameters. Destructuring reduces boilerplate when working with structs and tuples.

**Scope:**
- Parser: extend assignment parsing to accept patterns on the left-hand side
- Parser: extend parameter parsing to accept struct field destructuring
- Type checker: validate destructured fields exist on the source type
- Emitter: emit JavaScript destructuring (`const { name, age } = user`)

**Estimated complexity:** Medium-High — pattern infrastructure exists but needs new code paths in assignment and parameter handling.

---

## 5. Source Maps

**What:** Track source positions through the pipeline and emit source maps alongside `.ts` output.

**Why:** When debugging compiled TypeScript, developers need to trace errors back to their `.clarity` source. Every production transpiler needs this.

**Scope:**
- AST nodes already have `line`/`column` from parsing — pass these through to emission
- Emitter: track output line/column as it emits, build source map mappings
- Use `source-map` npm package or emit raw VLQ mappings
- CLI: write `.ts.map` alongside `.ts` output, add `//# sourceMappingURL` comment

**Estimated complexity:** Medium-High — plumbing is straightforward but source map encoding has fiddly details.

---

## 6. Better Error Messages with Source Context

**What:** Show the offending source line, a caret pointing to the error location, and a suggestion when possible.

**Why:** Current errors include line/column numbers but don't show the source context. Good error messages are one of the highest-leverage improvements for developer experience.

**Scope:**
- New utility: `src/diagnostics/reporter.ts` that takes source text + error position → formatted message
- Integrate into type checker and parser error paths
- Include "did you mean?" suggestions for misspelled identifiers (Levenshtein distance)

**Estimated complexity:** Low-Medium — purely additive, doesn't change existing logic.

---

## 7. Pipe-Aware Method Sugar for Collections

**What:** Built-in awareness of common collection operations (`filter`, `map`, `reduce`, `find`, `sort`) so the type checker can validate pipeline chains.

**Why:** Pipelines are the primary data flow mechanism, but the type checker currently can't validate `list |> filter(where .age > 18) |> map(each x => x.name)` end-to-end. Adding built-in signatures for collection methods would catch type errors in the most common code pattern.

**Scope:**
- Type checker: register built-in function signatures for `filter`, `map`, `reduce`, `find`, `sort`, `collect`
- Type checker: propagate generic types through pipeline chains (if input is `List<User>`, `filter` returns `List<User>`, `map(each x => x.name)` returns `List<Text>`)
- Short dot access (`.field`) type resolution within lambdas

**Estimated complexity:** High — requires generic type inference through pipeline chains, but pays off enormously in type safety.

---

## 8. Module System with File Resolution

**What:** Make `import` declarations actually resolve to other `.clarity` files and compile multi-file projects.

**Why:** Currently `import` is parsed and emitted but doesn't resolve to real files. A real module system is necessary for any non-trivial project.

**Scope:**
- CLI: accept a directory or entry-point file, discover imported files
- New module resolver: map `import { foo } from "bar"` → `./bar.clarity`
- Compile imported files, check for circular dependencies
- Type checker: load type information from imported modules
- Emitter: rewrite import paths to `.js` extensions for TypeScript/ESM

**Estimated complexity:** High — cross-file compilation is a significant architectural addition.

---

## 9. Tuple Type and Expressions

**What:** First-class tuple types like `(Number, Text)` and tuple expressions `(42, "hello")`.

**Why:** Tuple patterns exist in `match` statements but there's no tuple expression or type to go with them. Functions that need to return multiple values currently require defining a struct.

**Scope:**
- Lexer/Parser: tuple expressions `(expr, expr)` (distinguish from grouping by comma)
- AST: `TupleLiteral` expression node, `TupleType` type node
- Type checker: infer tuple element types, validate tuple pattern matching
- Emitter: emit as TypeScript `[value1, value2]` with `[Type1, Type2]` type annotations

**Estimated complexity:** Medium — requires careful disambiguation from parenthesized expressions.

---

## 10. LSP (Language Server Protocol) Foundation

**What:** A basic Language Server that provides diagnostics, go-to-definition, and hover information.

**Why:** Editor support is what makes a language usable day-to-day. The compiler already has all the information needed — the LSP just needs to expose it over the protocol.

**Scope:**
- New package or `src/lsp/` directory
- Diagnostics: run lexer + parser + type checker, report errors as LSP diagnostics
- Go-to-definition: use the type checker's scope/declaration registry
- Hover: show inferred types from the type checker
- Use `vscode-languageserver` npm package (the VS Code extension directory already exists)

**Estimated complexity:** High — significant new infrastructure, but each feature builds on existing compiler internals.

---

## Priority Ranking

| # | Feature | Impact | Effort | Suggested Order |
|---|---------|--------|--------|-----------------|
| 6 | Better Error Messages | High | Low | 1st |
| 1 | String Interpolation | High | Medium | 2nd |
| 2 | Formatter | Medium | Medium | 3rd |
| 9 | Tuple Types | Medium | Medium | 4th |
| 3 | Map/Set Literals | Medium | Medium | 5th |
| 4 | Destructuring | High | Medium-High | 6th |
| 7 | Pipeline Type Checking | Very High | High | 7th |
| 5 | Source Maps | Medium | Medium-High | 8th |
| 8 | Module Resolution | Very High | High | 9th |
| 10 | LSP Foundation | Very High | High | 10th |

The ordering prioritizes quick wins that improve developer experience first, then fills in language expressiveness, and saves the large architectural features for last — each of which builds on everything before it.
