# ClarityLang

A programming language designed for LLM code generation — transpiles to TypeScript.

Clarity uses English-like keywords, explicit types at boundaries, and a flat `keyword...end` block structure so that both humans and language models can read and generate code with minimal ambiguity.

## Quick Start

```bash
npm install
npm run build

# Compile a .clarity file to TypeScript
npm run clarity -- compile examples/pipeline.clarity

# Type-check without emitting
npm run clarity -- check examples/pipeline.clarity
```

## Example

```clarity
@purpose "Process daily sales and generate report"

define daily_report(date: Date) -> Result<Report, Error> as
  transactions = db.sales
    |> filter(where .date == date)
    |> filter(where .status == "completed")
    |> collect

  summary = transactions
    |> group(by .category)
    |> map(each group =>
        category: group.key,
        total: group.values |> sum(of .amount),
        count: group.values.length
      )
    |> sort(by .total, descending)

  return ok(Report(
    date: date,
    total_revenue: transactions |> sum(of .amount),
    transaction_count: transactions.length,
    by_category: summary,
    generated_at: now()
  ))
end
```

More examples in [`examples/`](examples/).

## Language Highlights

**Pipelines** as primary data flow:

```clarity
data |> filter(where .active) |> map(each x => x.name) |> collect
```

**Errors as values** with `Result<T,E>` and `?` propagation:

```clarity
body = request.parse_json(as: NewUser)?

check body.password.length >= 8
  or return bad_request("Password too short")
```

**Pattern matching:**

```clarity
match order.status on
  case Pending  => process_payment(order)
  case Shipped  => track_delivery(order)
  case _        => no_action()
end
```

**Immutable updates:**

```clarity
updated = order with status: Paid
```

**Tail recursion** (`@tailrec`) compiled to while loops, and **mutual recursion** (`@trampoline`) compiled to thunk bouncing:

```clarity
@tailrec
define factorial(n: Number, acc: Number) -> Number as
  if n <= 1 then
    return acc
  else
    return factorial(n - 1, n * acc)
  end
end
```

**Semantic annotations** that carry meaning:

```clarity
@purpose "Compute factorial using tail-recursive accumulator pattern"
@invariant "n >= 0"
@example "factorial(5, 1) => 120"
```

## Built-in Types

`Text`, `Number`, `Boolean`, `Void`, `List<T>`, `Map<K,V>`, `Set<T>`, `Maybe<T>`, `Result<T,E>`, `Duration`, `Date`, `Timestamp`

## Architecture

```
.clarity source → Lexer → Parser (AST) → Type Checker → Emitter → .ts output
```

| Stage | Location | Description |
|-------|----------|-------------|
| Lexer | `src/lexer/` | Tokenizes source; keywords defined in `tokens.ts` |
| Parser | `src/parser/` | Hand-written recursive descent; AST nodes in `ast.ts` |
| Type Checker | `src/typechecker/` | Boundary type validation, local inference, tail recursion & trampoline analysis |
| Emitter | `src/emitter/typescript.ts` | Walks AST, produces TypeScript output |
| CLI | `src/cli.ts` | `compile`, `check`, `fmt` commands |

## Development

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run build           # Build with tsup (outputs to dist/)
```

Run a single test file or test by name:

```bash
npx vitest run tests/lexer.test.ts
npx vitest run -t "tokenizes pipeline operator"
```

## License

ISC
