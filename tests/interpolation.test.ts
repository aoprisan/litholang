import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { TokenKind } from "../src/lexer/tokens.js";
import { Parser } from "../src/parser/parser.js";
import { TypeChecker } from "../src/typechecker/typechecker.js";
import { TypeScriptEmitter } from "../src/emitter/typescript.js";

function tokenize(source: string) {
  const lexer = new Lexer(source);
  return lexer.tokenize();
}

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function check(source: string) {
  const ast = parse(source);
  const checker = new TypeChecker();
  return checker.check(ast);
}

function compile(source: string) {
  const ast = parse(source);
  const emitter = new TypeScriptEmitter();
  return emitter.emit(ast);
}

// ─── Lexer ───

describe("Lexer: string interpolation", () => {
  it("tokenizes a plain string without interpolation", () => {
    const tokens = tokenize(`"hello"`);
    expect(tokens[0].kind).toBe(TokenKind.TextLiteral);
    expect(tokens[0].value).toBe("hello");
  });

  it("tokenizes a string with a single interpolation", () => {
    const tokens = tokenize(`"hello, {name}!"`);
    expect(tokens[0].kind).toBe(TokenKind.TextLiteral);
    expect(tokens[0].value).toBe("hello, ");
    expect(tokens[1].kind).toBe(TokenKind.InterpolationStart);
    expect(tokens[2].kind).toBe(TokenKind.Identifier);
    expect(tokens[2].value).toBe("name");
    expect(tokens[3].kind).toBe(TokenKind.InterpolationEnd);
    expect(tokens[4].kind).toBe(TokenKind.TextLiteral);
    expect(tokens[4].value).toBe("!");
  });

  it("tokenizes a string with multiple interpolations", () => {
    const tokens = tokenize(`"{a} and {b}"`);
    expect(tokens[0].kind).toBe(TokenKind.TextLiteral);
    expect(tokens[0].value).toBe("");
    expect(tokens[1].kind).toBe(TokenKind.InterpolationStart);
    expect(tokens[2].kind).toBe(TokenKind.Identifier);
    expect(tokens[2].value).toBe("a");
    expect(tokens[3].kind).toBe(TokenKind.InterpolationEnd);
    expect(tokens[4].kind).toBe(TokenKind.TextLiteral);
    expect(tokens[4].value).toBe(" and ");
    expect(tokens[5].kind).toBe(TokenKind.InterpolationStart);
    expect(tokens[6].kind).toBe(TokenKind.Identifier);
    expect(tokens[6].value).toBe("b");
    expect(tokens[7].kind).toBe(TokenKind.InterpolationEnd);
    expect(tokens[8].kind).toBe(TokenKind.TextLiteral);
    expect(tokens[8].value).toBe("");
  });

  it("tokenizes an expression inside interpolation", () => {
    const tokens = tokenize(`"result: {a + b}"`);
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toContain(TokenKind.InterpolationStart);
    expect(kinds).toContain(TokenKind.Plus);
    expect(kinds).toContain(TokenKind.InterpolationEnd);
  });

  it("allows escaping braces with backslash", () => {
    const tokens = tokenize(`"no \\{interpolation}"`);
    expect(tokens[0].kind).toBe(TokenKind.TextLiteral);
    expect(tokens[0].value).toBe("no {interpolation}");
  });
});

// ─── Parser ───

describe("Parser: string interpolation", () => {
  it("parses a plain string as a single text segment", () => {
    const ast = parse(`define f() -> Text as
  return "hello"
end`);
    const ret = ast.declarations[0] as any;
    const expr = ret.body[0].value;
    expect(expr.kind).toBe("TextLiteral");
    expect(expr.segments).toEqual([{ text: "hello" }]);
  });

  it("parses an interpolated string with identifier", () => {
    const ast = parse(`define greet(name: Text) -> Text as
  return "Hello, {name}!"
end`);
    const ret = (ast.declarations[0] as any).body[0].value;
    expect(ret.kind).toBe("TextLiteral");
    expect(ret.segments.length).toBe(3);
    expect(ret.segments[0]).toEqual({ text: "Hello, " });
    expect(ret.segments[1].expr.kind).toBe("IdentifierExpr");
    expect(ret.segments[1].expr.name).toBe("name");
    expect(ret.segments[2]).toEqual({ text: "!" });
  });

  it("parses an interpolated string with binary expression", () => {
    const ast = parse(`define f(a: Number, b: Number) -> Text as
  return "sum: {a + b}"
end`);
    const ret = (ast.declarations[0] as any).body[0].value;
    expect(ret.segments.length).toBe(2);
    expect(ret.segments[0]).toEqual({ text: "sum: " });
    expect(ret.segments[1].expr.kind).toBe("BinaryExpr");
  });

  it("parses multiple interpolations in one string", () => {
    const ast = parse(`define f(x: Text, y: Text) -> Text as
  return "{x} and {y}"
end`);
    const ret = (ast.declarations[0] as any).body[0].value;
    // segments: expr(x), text(" and "), expr(y)
    const exprSegments = ret.segments.filter((s: any) => "expr" in s);
    expect(exprSegments.length).toBe(2);
  });
});

// ─── Type Checker ───

describe("TypeChecker: string interpolation", () => {
  it("accepts valid interpolation expressions", () => {
    const errors = check(`define greet(name: Text) -> Text as
  return "Hello, {name}!"
end`);
    expect(errors).toEqual([]);
  });

  it("type-checks expressions inside interpolations", () => {
    const errors = check(`define f(a: Number, b: Number) -> Text as
  return "sum: {a + b}"
end`);
    expect(errors).toEqual([]);
  });
});

// ─── Emitter ───

describe("Emitter: string interpolation", () => {
  it("emits a plain string as a regular string literal", () => {
    const output = compile(`define f() -> Text as
  return "hello"
end`);
    expect(output).toContain('"hello"');
    expect(output).not.toContain("`");
  });

  it("emits an interpolated string as a template literal", () => {
    const output = compile(`define greet(name: Text) -> Text as
  return "Hello, {name}!"
end`);
    expect(output).toContain("`Hello, ${name}!`");
  });

  it("emits expressions inside interpolation", () => {
    const output = compile(`define f(a: Number, b: Number) -> Text as
  return "result: {a + b}"
end`);
    expect(output).toContain("`result: ${(a + b)}`");
  });

  it("emits multiple interpolations correctly", () => {
    const output = compile(`define f(x: Text, y: Text) -> Text as
  return "{x} and {y}"
end`);
    expect(output).toContain("`${x} and ${y}`");
  });

  it("emits function calls in interpolation", () => {
    const output = compile(`define name() -> Text as
  return "world"
end

define f() -> Text as
  return "Hello, {name()}!"
end`);
    expect(output).toContain("`Hello, ${name()}!`");
  });
});
