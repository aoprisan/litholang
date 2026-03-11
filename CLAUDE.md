# ClarityLang

## What This Is

ClarityLang is a programming language designed specifically for LLM code generation and comprehension. It transpiles to TypeScript (primary target), with Python and Rust as future targets.

## Design Principles (non-negotiable)

1. **Explicit Intent** — keywords read as English phrases, no magic methods or operator overloading
2. **Flat Scope** — max nesting depth of 3, pipelines (`|>`) as primary data flow
3. **Uniform Blocks** — every block is `keyword...end`, no braces, no significant indentation
4. **Typed at Boundaries** — function signatures and structs require types, locals are inferred
5. **Errors as Values** — `Result<T,E>` + `?` propagation, no exceptions
6. **Semantic Annotations** — `@purpose`, `@invariant`, `@example` carry meaning

## Architecture

```
.clarity source → Lexer → Parser (AST) → Type Checker → Emitter → .ts output
```

- **Lexer** (`src/lexer/`): Tokenizes `keyword...end` blocks. Tokens: keywords, identifiers, literals, operators (`|>`, `=>`, `?`, `->`), annotations (`@word`)
- **Parser** (`src/parser/`): Builds AST. Context-free grammar, no lookahead needed. AST node types mirror the EBNF grammar.
- **Type Checker** (`src/typechecker/`): Validates types at function boundaries and struct fields. Infers local variable types. Checks Result/Maybe usage.
- **Emitter** (`src/emitter/`): Walks AST and produces TypeScript. One emitter per target language.

## Language Keywords

`define`, `struct`, `enum`, `has`, `is`, `as`, `end`, `if`, `then`, `else`, `for`, `in`, `do`, `match`, `on`, `case`, `return`, `check`, `or`, `with`, `where`, `each`, `async`, `await`, `all`, `import`, `from`, `self`, `and`, `not`, `type`

## Built-in Types

`Text`, `Number`, `Boolean`, `Void`, `List<T>`, `Map<K,V>`, `Set<T>`, `Maybe<T>`, `Result<T,E>`, `Duration`, `Date`, `Timestamp`

## Key Syntax Patterns

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

-- Check guard
check condition or return error_value

-- Immutable update
new_record = old_record with field: new_value
```

## Tech Stack

- **Language**: TypeScript (the transpiler itself is written in TS)
- **Runtime**: Node.js 18+
- **Test runner**: Vitest
- **Build**: tsup
- **No external parser generators** — hand-written recursive descent parser

## Coding Conventions

- Use descriptive names, no abbreviations
- Every AST node type is a discriminated union with a `kind` field
- Emitter methods follow the pattern `emitNodeKind(node): string`
- Tests go in `tests/` mirroring `src/` structure
- One file per concern, keep files under 300 lines
