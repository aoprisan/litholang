# LithoLang for Visual Studio Code

Language support for [LithoLang](https://github.com/litholang/litholang) — a programming language designed for LLM code generation that transpiles to TypeScript.

## Features

- **Syntax Highlighting** — Full TextMate grammar for `.litho` files covering all keywords, operators, types, annotations, string interpolation, and built-in functions
- **Language Server** — Real-time diagnostics (parse errors + type errors), hover documentation, and completions powered by the Litho compiler
- **Code Snippets** — 20+ snippets for common patterns: `define`, `struct`, `enum`, `match`, `tuple`, `extern`, `try`, `pipe`, annotations, and more
- **Bracket Matching** — Auto-closing and matching for parentheses, brackets, and quotes
- **Code Folding** — Fold `keyword...end` blocks (functions, structs, enums, if/for/match/repeat/try)
- **Auto-Indentation** — Smart indentation for block keywords
- **Comment Toggle** — `Ctrl+/` toggles `--` line comments

## Language Server Features

### Diagnostics
Real-time error reporting as you type — parse errors and type errors are shown inline with squiggly underlines and in the Problems panel.

### Hover
Hover over keywords, built-in types, and built-in functions to see documentation. Examples:
- **Types**: `Text`, `Number`, `Tuple`, `Result`, etc.
- **Keywords**: `define`, `match`, `check`, `extern`, etc.
- **Built-ins**: `ok`, `err`, `enumerate`, `zip`, `filter`, `map`, etc.

### Completions
Auto-complete keywords, built-in types, and built-in functions.

## Installation

### VS Code Marketplace

Search for **LithoLang** in the VS Code Extensions panel, or install from the command line:

```bash
code --install-extension litholang.litholang
```

### From Source (Development)

```bash
cd vscode-extension
npm install
npm run build
```

Then symlink or copy into `~/.vscode/extensions/litholang`:

```bash
ln -s "$(pwd)" ~/.vscode/extensions/litholang
```

Restart VS Code.

### Using VSIX

```bash
cd vscode-extension
npm install
npm run build
npm run package
code --install-extension litholang-0.2.0.vsix
```

## Supported Syntax

### Keywords

`define`, `struct`, `enum`, `has`, `is`, `as`, `end`, `if`, `then`, `else`, `for`, `in`, `do`, `match`, `on`, `case`, `return`, `check`, `or`, `with`, `where`, `each`, `async`, `await`, `all`, `import`, `from`, `self`, `and`, `not`, `type`, `extern`, `export`, `of`, `by`, `repeat`, `while`, `try`, `rescue`, `collect`

### Built-in Types

`Text`, `Number`, `Boolean`, `Void`, `List<T>`, `Map<K,V>`, `Set<T>`, `Maybe<T>`, `Result<T,E>`, `Tuple<A,B>`, `Duration`, `Date`, `Timestamp`

### Built-in Functions

`ok`, `err`, `some`, `none`, `print`, `range`, `filter`, `map`, `sort`, `sum`, `first`, `last`, `skip`, `take`, `enumerate`, `zip`, `group`, `flatten`, `contains`, `length`, `to_text`, `to_number`, `collect`

### Operators

`|>` (pipeline), `->` (return type), `=>` (lambda/case), `?` (error propagation), `..` (range), `==`, `!=`, `<`, `>`, `<=`, `>=`, `+`, `-`, `*`, `/`, `%`

### Annotations

`@purpose`, `@invariant`, `@example`, `@tailrec`, `@trampoline`

## Snippet Prefixes

| Prefix | Description |
|-----------|-------------|
| `define` | Function definition |
| `adefine` | Async function definition |
| `struct` | Struct definition |
| `enum` | Enum definition |
| `if` | If-then block |
| `ife` | If-then-else block |
| `match` | Pattern matching |
| `matcht` | Pattern match on tuple |
| `for` | For-in loop |
| `check` | Check guard |
| `checkerr` | Check guard returning error |
| `pipe` | Pipeline expression |
| `import` | Import declaration |
| `extern` | Extern function (FFI) |
| `aextern` | Async extern function |
| `try` | Try-rescue block |
| `repeat` | Repeat-while loop |
| `tuple` | Tuple type annotation |
| `tailrec` | Tail-recursive function |
| `type` | Type alias |
| `@purpose` | Purpose annotation |
| `@invariant` | Invariant annotation |
| `@example` | Example annotation |
