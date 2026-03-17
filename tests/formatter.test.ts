import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { Parser } from "../src/parser/parser.js";
import { Formatter } from "../src/formatter/formatter.js";

function format(source: string): string {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const formatter = new Formatter();
  return formatter.format(ast);
}

describe("Formatter", () => {
  it("formats a simple function", () => {
    const output = format(`define   greet(name:  Text)  ->  Text  as
  return   "Hello"
end`);

    expect(output).toBe(`define greet(name: Text) -> Text as
  return "Hello"
end
`);
  });

  it("formats struct definition", () => {
    const output = format(`struct   Point   has
  x:   Number
  y:   Number
end`);

    expect(output).toBe(`struct Point has
  x: Number
  y: Number
end
`);
  });

  it("formats enum definition", () => {
    const output = format(`enum Color is
  Red
  Green
  Blue
end`);

    expect(output).toBe(`enum Color is
  Red
  Green
  Blue
end
`);
  });

  it("formats annotations", () => {
    const output = format(`@purpose "Test"
define test() -> Void as
  return undefined
end`);

    expect(output).toContain('@purpose "Test"');
    expect(output).toContain("define test()");
  });

  it("formats if-then-else", () => {
    const output = format(`define test(x: Number) -> Text as
  if x > 0 then
    return "pos"
  else
    return "neg"
  end
end`);

    expect(output).toContain("  if x > 0 then");
    expect(output).toContain('    return "pos"');
    expect(output).toContain("  else");
    expect(output).toContain("  end");
  });

  it("formats match statement", () => {
    const output = format(`define test(x: Number) -> Text as
  match x on
    case 1 => "one"
    case _ => "other"
  end
end`);

    expect(output).toContain("  match x on");
    expect(output).toContain('    case 1 => "one"');
    expect(output).toContain('    case _ => "other"');
  });

  it("formats multi-step pipeline across lines", () => {
    const output = format(`define test(data: List<Number>) -> List<Number> as
  result = data |> filter(x) |> map(y)
  return result
end`);

    expect(output).toContain("|> filter(x)");
    expect(output).toContain("|> map(y)");
  });

  it("formats tuple expression", () => {
    const output = format(`define test(x: Number, y: Text) -> Void as
  t = (x, y)
  return t
end`);

    expect(output).toContain("(x, y)");
  });

  it("formats default parameter values", () => {
    const output = format(`define greet(name: Text, greeting: Text = "Hello") -> Text as
  return greeting
end`);

    expect(output).toContain('greeting: Text = "Hello"');
  });

  it("formats import declaration", () => {
    const output = format(`import foo, bar from "module"`);
    expect(output).toBe(`import foo, bar from "module"\n`);
  });

  it("formats extern definition", () => {
    const output = format(`extern define readFile(path: Text) -> Text
  from "fs"
end`);

    expect(output).toContain("extern define readFile(path: Text) -> Text");
    expect(output).toContain('  from "fs"');
  });

  it("separates top-level declarations with blank lines", () => {
    const output = format(`struct A has
  x: Number
end
struct B has
  y: Number
end`);

    expect(output).toContain("end\n\nstruct B");
  });

  it("formats for loop", () => {
    const output = format(`define test(items: List<Number>) -> Void as
  for item in items do
    print(item)
  end
end`);

    expect(output).toContain("  for item in items do");
    expect(output).toContain("    print(item)");
    expect(output).toContain("  end");
  });

  it("formats check statement", () => {
    const output = format(`define test(x: Number) -> Number as
  check x > 0 or return 0
  return x
end`);

    expect(output).toContain("  check x > 0 or return 0");
  });

  it("round-trips formatted code unchanged", () => {
    const source = `define test(x: Number) -> Number as
  return x + 1
end
`;
    const formatted = format(source);
    const reformatted = format(formatted);
    expect(reformatted).toBe(formatted);
  });
});
