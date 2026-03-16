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

  it("throws on unterminated string literal", () => {
    const source = `"hello`;
    const lexer = new Lexer(source);
    expect(() => lexer.tokenize()).toThrow("Unterminated string literal");
  });

  it("handles escape sequences in strings", () => {
    const source = `"line1\\nline2\\t\\\\end\\"quote"`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const text = tokens.find((t) => t.kind === TokenKind.TextLiteral);
    expect(text?.value).toBe('line1\nline2\t\\end"quote');
  });

  it("tokenizes decimal numbers", () => {
    const source = `3.14 42 0.5`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const numbers = tokens.filter((t) => t.kind === TokenKind.NumberLiteral);
    expect(numbers.map((t) => t.value)).toEqual(["3.14", "42", "0.5"]);
  });

  it("tokenizes boolean literals", () => {
    const source = `true false`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const bools = tokens.filter((t) => t.kind === TokenKind.BooleanLiteral);
    expect(bools.map((t) => t.value)).toEqual(["true", "false"]);
  });

  it("throws on unexpected characters", () => {
    const source = `~`;
    const lexer = new Lexer(source);
    expect(() => lexer.tokenize()).toThrow("Unexpected character");
  });

  it("handles \\r\\n line endings", () => {
    const source = "a\r\nb";
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const ids = tokens.filter((t) => t.kind === TokenKind.Identifier);
    expect(ids).toHaveLength(2);
    expect(ids[0].value).toBe("a");
    expect(ids[1].value).toBe("b");
    expect(ids[1].line).toBe(2);
  });

  it("tracks line numbers correctly across multiple lines", () => {
    const source = `a
b
c`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();

    const ids = tokens.filter((t) => t.kind === TokenKind.Identifier);
    expect(ids[0].line).toBe(1);
    expect(ids[1].line).toBe(2);
    expect(ids[2].line).toBe(3);
  });
});
