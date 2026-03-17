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

  it("emits tagged union enum as discriminated union", () => {
    const output = compileToTS(`enum Shape is
  Circle(radius: Number)
  Rectangle(width: Number, height: Number)
  Point
end`);

    expect(output).toContain("type Shape =");
    expect(output).toContain('{ kind: "Circle"; radius: number }');
    expect(output).toContain('{ kind: "Rectangle"; width: number; height: number }');
    expect(output).toContain('{ kind: "Point" }');
    expect(output).toContain("function Circle(radius: number): Shape");
    expect(output).toContain("function Rectangle(width: number, height: number): Shape");
    expect(output).toContain("function Point(): Shape");
  });

  it("emits match on tagged union with constructor patterns", () => {
    const output = compileToTS(`enum Shape is
  Circle(radius: Number)
  Rectangle(width: Number, height: Number)
end

define area(s: Shape) -> Number as
  match s on
    case Circle(r) => r
    case Rectangle(dims) => dims
  end
end`);

    expect(output).toContain('s.kind === "Circle"');
    expect(output).toContain('s.kind === "Rectangle"');
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

  it("emits await expression", () => {
    const output = compileToTS(`async define fetch_data(url: Text) -> Text as
  result = await get(url)
  return result
end`);

    expect(output).toContain("async function fetch_data(url: string): string {");
    expect(output).toContain("const result = await get(url);");
  });

  it("emits all expression as Promise.all", () => {
    const output = compileToTS(`async define fetch_both(a: Text, b: Text) -> List<Text> as
  results = all [get(a), get(b)]
  return results
end`);

    expect(output).toContain("async function fetch_both");
    expect(output).toContain("const results = await Promise.all([get(a), get(b)]);");
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

  it("emits const for variable assignments", () => {
    const output = compileToTS(`define test(x: Number) -> Number as
  y = x + 1
  return y
end`);

    expect(output).toContain("const y = (x + 1);");
    expect(output).not.toContain("let y");
  });

  it("emits tailrec param reassignment without const/let", () => {
    const output = compileToTS(`@tailrec
define countdown(n: Number) -> Number as
  if n <= 0 then
    return 0
  else
    return countdown(n - 1)
  end
end`);

    // Temp vars use let, param reassignments are bare
    expect(output).toContain("let __tailrec_n");
    expect(output).toMatch(/^\s+n = __tailrec_n;/m);
    expect(output).not.toMatch(/const n = __tailrec_n/);
  });

  it("emits export on top-level declarations", () => {
    const output = compileToTS(`define add(a: Number, b: Number) -> Number as
  return a + b
end`);

    expect(output).toContain("export function add");
  });

  it("emits export on structs", () => {
    const output = compileToTS(`struct Point has
  x: Number
  y: Number
end`);

    expect(output).toContain("export interface Point");
  });

  it("emits export on enums", () => {
    const output = compileToTS(`enum Color is
  Red
  Green
  Blue
end`);

    expect(output).toContain("export enum Color");
  });

  it("emits export on type aliases", () => {
    const output = compileToTS(`type UserId = Number`);
    expect(output).toContain("export type UserId");
  });

  it("emits string interpolation as template literal", () => {
    const output = compileToTS(`define greet(name: Text) -> Text as
  return "Hello, {name}!"
end`);

    expect(output).toContain("`Hello, ${name}!`");
  });

  it("emits plain strings without interpolation as regular strings", () => {
    const output = compileToTS(`define test() -> Text as
  return "no interpolation"
end`);

    expect(output).toContain('"no interpolation"');
    expect(output).not.toContain("`");
  });

  it("emits match with pattern variable bindings", () => {
    const output = compileToTS(`define describe(x: Number) -> Text as
  match x on
    case 0 => return "zero"
    case n => return "other"
  end
end`);

    expect(output).toContain("const n = x;");
  });

  it("emits ok() as Result object literal", () => {
    const output = compileToTS(`define test() -> Result<Number, Error> as
  return ok(42)
end`);

    expect(output).toContain("{ ok: true, value: 42 }");
  });

  it("emits err() as Result object literal", () => {
    const output = compileToTS(`define test() -> Result<Number, Text> as
  return err("oops")
end`);

    expect(output).toContain('{ ok: false, error: "oops" }');
  });

  it("emits some() as the inner value", () => {
    const output = compileToTS(`define test() -> Maybe<Number> as
  return some(42)
end`);

    expect(output).toContain("return 42;");
  });

  it("emits none as null", () => {
    const output = compileToTS(`define test() -> Maybe<Number> as
  return none
end`);

    expect(output).toContain("return null;");
  });

  it("emits pattern guard as additional condition", () => {
    const output = compileToTS(`define classify(age: Number) -> Text as
  match age on
    case n where n >= 18 => return "adult"
    case _ => return "minor"
  end
end`);

    expect(output).toContain("return (n >= 18)");
    expect(output).toContain("const n = age;");
  });

  it("emits default parameter values", () => {
    const output = compileToTS(`define greet(name: Text, greeting: Text = "Hello") -> Text as
  return greeting
end`);

    expect(output).toContain('greeting: string = "Hello"');
  });

  it("emits tuple expression as array", () => {
    const output = compileToTS(`define test(x: Number, y: Text) -> Void as
  t = (x, y)
  return t
end`);

    expect(output).toContain("const t = [x, y];");
  });

  it("emits tuple match with array indexing", () => {
    const output = compileToTS(`define test(x: Number, y: Text) -> Text as
  match (x, y) on
    case (1, "hi") => return "match"
    case (_, _) => return "other"
  end
end`);

    expect(output).toContain("[x, y][0] === 1");
    expect(output).toContain('[x, y][1] === "hi"');
  });

  it("emits where keyword as lambda", () => {
    const output = compileToTS(`define test(items: List<Number>) -> List<Number> as
  result = items |> filter(where .active == true)
  return result
end`);

    expect(output).toContain("filter(items, (__it) => (__it.active == true))");
  });

  it("emits of keyword as lambda", () => {
    const output = compileToTS(`define test(items: List<Number>) -> Number as
  result = items |> sum(of .amount)
  return result
end`);

    expect(output).toContain("sum(items, (__it) => __it.amount)");
  });

  it("emits multi-line pipeline", () => {
    const output = compileToTS(`define test(data: List<Number>) -> List<Number> as
  result = data
    |> filter(x)
    |> sort(y)
  return result
end`);

    expect(output).toContain("sort(filter(data, x), y)");
  });

  it("emits multi-line constructor call", () => {
    const output = compileToTS(`struct Point has
  x: Number
  y: Number
end

define test() -> Point as
  return Point(
    x: 10,
    y: 20
  )
end`);

    expect(output).toContain("{ x: 10, y: 20 }");
  });

  it("emits named arguments without comment wrappers", () => {
    const output = compileToTS(`define test() -> Void as
  result = some_func(name: "Alice", age: 30)
  return result
end`);

    expect(output).not.toContain("/* name:");
    expect(output).not.toContain("/* age:");
    expect(output).toContain('some_func("Alice", 30)');
  });

  it("prepends prelude when prelude functions are used", () => {
    const output = compileToTS(`define test() -> Void as
  print("hello")
  n = range(10)
  return undefined
end`);

    expect(output).toContain("// --- Litholang Prelude ---");
    expect(output).toContain("function print(");
    expect(output).toContain("function range(");
  });

  it("prepends collections when collection functions are used", () => {
    const output = compileToTS(`define test(items: List<Number>) -> List<Number> as
  result = filter(items, each x => x > 0)
  return result
end`);

    expect(output).toContain("// --- Litholang Collections ---");
    expect(output).toContain("function filter<T>(");
  });

  it("does not prepend runtime when no runtime functions are used", () => {
    const output = compileToTS(`define add(a: Number, b: Number) -> Number as
  return a + b
end`);

    expect(output).not.toContain("// --- Litholang Prelude ---");
    expect(output).not.toContain("// --- Litholang Collections ---");
  });

  it("does not prepend runtime when user defines same-named function", () => {
    const output = compileToTS(`define print(msg: Text) -> Void as
  return undefined
end

define test() -> Void as
  print("hello")
  return undefined
end`);

    expect(output).not.toContain("// --- Litholang Prelude ---");
  });

  it("emits or-patterns as || conditions", () => {
    const output = compileToTS(`define classify(s: Text) -> Text as
  match s on
    case "active" | "pending" => "open"
    case "closed" | "archived" => "done"
    case _ => "unknown"
  end
end`);

    expect(output).toContain('s === "active" || s === "pending"');
    expect(output).toContain('s === "closed" || s === "archived"');
  });

  it("emits range expressions as range() calls", () => {
    const output = compileToTS(`define test() -> List<Number> as
  return 1..10
end`);

    expect(output).toContain("range(1, 10)");
    // Should auto-inject prelude since range is used
    expect(output).toContain("Litholang Prelude");
  });

  it("emits repeat-while as while loop", () => {
    const output = compileToTS(`define countdown(n: Number) -> Number as
  repeat while n > 0 do
    n = n - 1
  end
  return n
end`);

    expect(output).toContain("while ((n > 0))");
    expect(output).toContain("n = (n - 1);");
  });
});
