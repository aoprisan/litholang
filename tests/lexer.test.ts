import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { TokenKind } from "../src/lexer/tokens.js";

describe("Lexer", () => {
  it("tokenizes a simple function definition", () => {
    const source = `define greet(name: Text) -> Text as
  return "Hello, {name}!"
end`;

    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    expect(tokens[0].kind).toBe(TokenKind.Define);
    expect(tokens[1].kind).toBe(TokenKind.Identifier);
    expect(tokens[1].value).toBe("greet");
    expect(tokens[2].kind).toBe(TokenKind.LeftParen);
  });

  it("tokenizes pipeline operators", () => {
    const source = `data |> filter(where .active) |> collect`;

    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const pipes = tokens.filter((t) => t.kind === TokenKind.Pipe);
    expect(pipes).toHaveLength(2);
  });

  it("tokenizes annotations", () => {
    const source = `@purpose "Rate limit API calls"`;

    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    expect(tokens[0].kind).toBe(TokenKind.Annotation);
    expect(tokens[0].value).toBe("purpose");
    expect(tokens[1].kind).toBe(TokenKind.TextLiteral);
  });

  it("ignores comments", () => {
    const source = `-- this is a comment
define foo() -> Void as
  -- another comment
  return
end`;

    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const commentTokens = tokens.filter(
      (t) => t.value.startsWith("--")
    );
    expect(commentTokens).toHaveLength(0);
  });

  it("handles all comparison operators", () => {
    const source = `a == b != c <= d >= e < f > g`;

    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const ops = tokens
      .filter((t) =>
        [
          TokenKind.DoubleEquals,
          TokenKind.NotEquals,
          TokenKind.LessOrEqual,
          TokenKind.GreaterOrEqual,
          TokenKind.LessThan,
          TokenKind.GreaterThan,
        ].includes(t.kind)
      )
      .map((t) => t.kind);

    expect(ops).toEqual([
      TokenKind.DoubleEquals,
      TokenKind.NotEquals,
      TokenKind.LessOrEqual,
      TokenKind.GreaterOrEqual,
      TokenKind.LessThan,
      TokenKind.GreaterThan,
    ]);
  });
});
