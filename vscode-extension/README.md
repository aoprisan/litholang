# LithoLang for Visual Studio Code

Language support for [LithoLang](https://github.com/litholang/litholang) — a programming language designed for LLM code generation that transpiles to TypeScript.

## Features

- **Syntax Highlighting** — Full TextMate grammar for `.litho` files covering keywords, operators, types, annotations, string interpolation, and more
- **Code Snippets** — Snippets for common patterns: `define`, `struct`, `enum`, `match`, `if`, `check`, `pipe`, annotations, and more
- **Bracket Matching** — Auto-closing and matching for parentheses, brackets, and quotes
- **Code Folding** — Fold `keyword...end` blocks (functions, structs, enums, if/for/match)
- **Auto-Indentation** — Smart indentation for block keywords
- **Comment Toggle** — `Ctrl+/` toggles `--` line comments

## Installation

### From Source

1. Clone this repository
2. Copy or symlink the `vscode-extension` directory into `~/.vscode/extensions/litholang`
3. Restart VS Code

### Using VSIX

```bash
cd vscode-extension
npx @vscode/vsce package
code --install-extension litholang-0.1.0.vsix
```

## Supported Syntax

### Keywords

`define`, `struct`, `enum`, `has`, `is`, `as`, `end`, `if`, `then`, `else`, `for`, `in`, `do`, `match`, `on`, `case`, `return`, `check`, `or`, `with`, `where`, `each`, `async`, `await`, `all`, `import`, `from`, `self`, `and`, `not`, `type`

### Built-in Types

`Text`, `Number`, `Boolean`, `Void`, `List<T>`, `Map<K,V>`, `Set<T>`, `Maybe<T>`, `Result<T,E>`, `Duration`, `Date`, `Timestamp`

### Operators

`|>` (pipeline), `->` (return type), `=>` (lambda), `?` (error propagation), `==`, `!=`, `<`, `>`, `<=`, `>=`, `+`, `-`, `*`, `/`, `%`

### Annotations

`@purpose`, `@invariant`, `@example`

## Snippet Prefixes

| Prefix | Description |
|--------|-------------|
| `define` | Function definition |
| `adefine` | Async function definition |
| `struct` | Struct definition |
| `enum` | Enum definition |
| `if` | If-then block |
| `ife` | If-then-else block |
| `match` | Pattern matching |
| `for` | For-in loop |
| `check` | Check guard |
| `pipe` | Pipeline expression |
| `import` | Import declaration |
| `@purpose` | Purpose annotation |
| `@invariant` | Invariant annotation |
| `@example` | Example annotation |
| `type` | Type alias |
