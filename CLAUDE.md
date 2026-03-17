# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

- `npm run build` — Build with tsup (outputs to `dist/`)
- `npm test` — Run all tests (Vitest)
- `npm run test:watch` — Run tests in watch mode
- `npx vitest run tests/lexer.test.ts` — Run a single test file
- `npx vitest run -t "test name"` — Run a single test by name
- `npm run litho -- compile <file.litho>` — Compile a .litho file to TypeScript (uses tsx)
- `npm run litho -- check <file.litho>` — Type-check a .litho file without emitting

## Architecture

The compiler pipeline flows linearly:

```
.litho source → Lexer → Parser (AST) → Type Checker → Emitter → .ts output
```

- **Lexer** (`src/lexer/`): Tokenizes source into tokens. Keywords map via `KEYWORDS` in `tokens.ts`. Handles `keyword...end` block structure.
- **Parser** (`src/parser/`): Hand-written recursive descent parser (no parser generators). Builds AST from token stream. All AST node types are discriminated unions on a `kind` field, defined in `ast.ts`.
- **Type Checker** (`src/typechecker/typechecker.ts`): Validates types at function boundaries and struct fields. Infers local variable types. Includes tail recursion analysis (`tailrec.ts`) and mutual recursion trampoline optimization (`trampoline.ts`).
- **Emitter** (`src/emitter/typescript.ts`): Walks AST and produces TypeScript. Emitter methods follow the pattern `emitNodeKind(node): string`. One emitter file per target language (only TypeScript exists currently).
- **CLI** (`src/cli.ts`): Entry point for `litho compile|check|fmt` commands. Orchestrates the full pipeline.
- **Public API** (`src/index.ts`): Re-exports all compiler components for programmatic use.

Tests live in `tests/` with one test file per compiler phase (e.g., `tests/lexer.test.ts`, `tests/parser.test.ts`). Example `.litho` programs are in `examples/`.

## Design Principles

1. **Explicit Intent** — keywords read as English phrases, no magic methods or operator overloading
2. **Flat Scope** — max nesting depth of 3, pipelines (`|>`) as primary data flow
3. **Uniform Blocks** — every block is `keyword...end`, no braces, no significant indentation
4. **Typed at Boundaries** — function signatures and structs require types, locals are inferred
5. **Errors as Values** — `Result<T,E>` + `?` propagation, no exceptions
6. **Semantic Annotations** — `@purpose`, `@invariant`, `@example` carry meaning

## Coding Conventions

- Every AST node type is a discriminated union with a `kind` field
- Emitter methods follow the pattern `emitNodeKind(node): string`
- Tests go in `tests/` mirroring `src/` structure
- One file per concern, keep files under 300 lines
- Use descriptive names, no abbreviations
- ESM modules (`"type": "module"` in package.json), imports use `.js` extensions

## Language Reference

### Keywords

`define`, `struct`, `enum`, `has`, `is`, `as`, `end`, `if`, `then`, `else`, `for`, `in`, `do`, `match`, `on`, `case`, `return`, `check`, `or`, `with`, `where`, `each`, `async`, `await`, `all`, `import`, `from`, `self`, `and`, `not`, `type`, `extern`

### Built-in Types

`Text`, `Number`, `Boolean`, `Void`, `List<T>`, `Map<K,V>`, `Set<T>`, `Maybe<T>`, `Result<T,E>`, `Duration`, `Date`, `Timestamp`

### Key Syntax Patterns

```
-- Function
define name(param: Type) -> ReturnType as
  ...
end

-- Struct
struct Name has
  field: Type
end

-- Enum
enum Name is
  Variant1
  Variant2
end

-- Pipeline
data |> filter(where .field == value) |> map(each x => x.name) |> collect

-- Error propagation
result = fallible_call()?

-- Pattern matching
match expr on
  case pattern => result
  case _ => default
end

-- FFI (extern function)
extern define readFile(path: Text) -> Text
  from "fs"
end

-- Check guard
check condition or return error_value

-- Immutable update
new_record = old_record with field: new_value
```
