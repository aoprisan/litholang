import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { Parser } from "../src/parser/parser.js";
import { TypeScriptEmitter } from "../src/emitter/typescript.js";

function compileToTS(source: string): string {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const emitter = new TypeScriptEmitter();
  return emitter.emit(ast);
}

describe("TypeScriptEmitter - end to end", () => {
  it("emits a simple function", () => {
    const output = compileToTS(`define add(a: Number, b: Number) -> Number as
  return a + b
end`);

    expect(output).toContain("function add(a: number, b: number): number {");
    expect(output).toContain("return (a + b);");
    expect(output).toContain("}");
  });

  it("emits struct as interface", () => {
    const output = compileToTS(`struct Point has
  x: Number
  y: Number
end`);

    expect(output).toContain("interface Point {");
    expect(output).toContain("x: number;");
    expect(output).toContain("y: number;");
  });

  it("emits enum", () => {
    const output = compileToTS(`enum Color is
  Red
  Green
  Blue
end`);

    expect(output).toContain("enum Color {");
    expect(output).toContain("Red,");
    expect(output).toContain("Green,");
    expect(output).toContain("Blue,");
  });

  it("emits import declaration", () => {
    const output = compileToTS(`import foo, bar from "my-module"`);

    expect(output).toContain('import { foo, bar } from "my-module";');
  });

  it("emits type alias", () => {
    const output = compileToTS(`type UserId = Number`);
    expect(output).toContain("type UserId = number;");
  });

  it("emits if-then-else", () => {
    const output = compileToTS(`define test(x: Number) -> Number as
  if x > 0 then
    return 1
  else
    return 0
  end
end`);

    expect(output).toContain("if ((x > 0)) {");
    expect(output).toContain("return 1;");
    expect(output).toContain("} else {");
    expect(output).toContain("return 0;");
  });

  it("emits for loop", () => {
    const output = compileToTS(`define test(items: List<Number>) -> Void as
  for item in items do
    x = item
  end
end`);

    expect(output).toContain("for (const item of items) {");
  });

  it("emits check statement", () => {
    const output = compileToTS(`define test(x: Number) -> Number as
  check x > 0 or return 0
  return x
end`);

    expect(output).toContain("if (!((x > 0))) return 0;");
  });

  it("emits Result and Maybe types", () => {
    const output = compileToTS(`define test(x: Maybe<Number>) -> Result<Text, Error> as
  return "ok"
end`);

    expect(output).toContain("number | null");
    expect(output).toContain("{ ok: true; value: string } | { ok: false; error: Error }");
  });

  it("emits with expression as spread", () => {
    const output = compileToTS(`define test(p: Point) -> Point as
  return p with x: 10
end`);

    expect(output).toContain("{ ...p, x: 10 }");
  });

  it("emits async function", () => {
    const output = compileToTS(`async define fetch(url: Text) -> Text as
  return "data"
end`);

    expect(output).toContain("async function fetch(url: string): string {");
  });

  it("emits @tailrec function as while loop (end to end)", () => {
    const output = compileToTS(`@tailrec
define factorial(n: Number, acc: Number) -> Number as
  if n <= 1 then
    return acc
  else
    return factorial(n - 1, n * acc)
  end
end`);

    expect(output).toContain("while (true)");
    expect(output).toContain("continue;");
  });
});
