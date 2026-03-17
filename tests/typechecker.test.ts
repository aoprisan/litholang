import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { Parser } from "../src/parser/parser.js";
import { TypeChecker } from "../src/typechecker/typechecker.js";
import { TypeScriptEmitter } from "../src/emitter/typescript.js";

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

function compileToTS(source: string): string {
  const ast = parse(source);
  const emitter = new TypeScriptEmitter();
  return emitter.emit(ast);
}

describe("TypeChecker", () => {
  describe("valid programs", () => {
    it("accepts a simple function with matching return type", () => {
      const errors = check(`define add(a: Number, b: Number) -> Number as
  return a + b
end`);
      expect(errors).toEqual([]);
    });

    it("accepts a function returning Text", () => {
      const errors = check(`define greet(name: Text) -> Text as
  return name
end`);
      expect(errors).toEqual([]);
    });

    it("accepts struct definitions", () => {
      const errors = check(`struct Point has
  x: Number
  y: Number
end`);
      expect(errors).toEqual([]);
    });

    it("accepts enum definitions", () => {
      const errors = check(`enum Color is
  Red
  Green
  Blue
end`);
      expect(errors).toEqual([]);
    });

    it("accepts type aliases", () => {
      const errors = check(`type UserId = Number`);
      expect(errors).toEqual([]);
    });

    it("accepts variables used after assignment", () => {
      const errors = check(`define test(x: Number) -> Number as
  y = x + 1
  return y
end`);
      expect(errors).toEqual([]);
    });

    it("accepts for loops with List iterables", () => {
      const errors = check(`define test(items: List<Number>) -> Void as
  for item in items do
    x = item
  end
end`);
      expect(errors).toEqual([]);
    });

    it("accepts async functions with await", () => {
      const errors = check(`async define fetch_data(url: Text) -> Text as
  result = await get_data(url)
  return result
end`);
      expect(errors).toEqual([]);
    });

    it("accepts async functions with all expression", () => {
      const errors = check(`async define fetch_both(a: Text, b: Text) -> List<Text> as
  results = all [get(a), get(b)]
  return results
end`);
      expect(errors).toEqual([]);
    });

    it("accepts Result and Maybe types", () => {
      const errors = check(`define test(x: Maybe<Number>) -> Result<Text, Error> as
  return "ok"
end`);
      expect(errors).toEqual([]);
    });

    it("accepts match statements", () => {
      const errors = check(`define test(x: Number) -> Text as
  match x on
    case 1 => return "one"
    case 2 => return "two"
    case _ => return "other"
  end
end`);
      expect(errors).toEqual([]);
    });

    it("accepts check statements", () => {
      const errors = check(`define test(x: Number) -> Number as
  check x > 0 or return 0
  return x
end`);
      expect(errors).toEqual([]);
    });

    it("accepts if-then-else", () => {
      const errors = check(`define test(x: Number) -> Number as
  if x > 0 then
    return 1
  else
    return 0
  end
end`);
      expect(errors).toEqual([]);
    });

    it("accepts struct with type alias reference", () => {
      const errors = check(`type UserId = Number

struct User has
  id: UserId
  name: Text
end`);
      expect(errors).toEqual([]);
    });
  });

  describe("return type mismatches", () => {
    it("detects returning Number when Text expected", () => {
      const errors = check(`define test(x: Number) -> Text as
  return x
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Return type mismatch");
      expect(errors[0].message).toContain("Text");
      expect(errors[0].message).toContain("Number");
    });

    it("detects returning Text when Number expected", () => {
      const errors = check(`define test() -> Number as
  return "hello"
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Return type mismatch");
    });

    it("detects returning Boolean when Number expected", () => {
      const errors = check(`define test() -> Number as
  return true
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Return type mismatch");
    });
  });

  describe("await outside async", () => {
    it("rejects await in non-async function", () => {
      const errors = check(`define test(url: Text) -> Text as
  result = await get(url)
  return result
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("await");
      expect(errors[0].message).toContain("async");
    });

    it("rejects all expression in non-async function", () => {
      const errors = check(`define test(a: Text, b: Text) -> List<Text> as
  results = all [get(a), get(b)]
  return results
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("all");
      expect(errors[0].message).toContain("async");
    });

    it("allows await in async function", () => {
      const errors = check(`async define test(url: Text) -> Text as
  result = await get(url)
  return result
end`);
      expect(errors).toEqual([]);
    });
  });

  describe("propagation operator", () => {
    it("rejects ? on Number type", () => {
      const errors = check(`define test(x: Number) -> Number as
  y = x?
  return y
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Propagation operator");
      expect(errors[0].message).toContain("Result<T,E> or Maybe<T>");
    });

    it("allows ? on Result type", () => {
      const errors = check(`define fallible(x: Number) -> Result<Number, Error> as
  return x
end

define test(x: Number) -> Number as
  y = fallible(x)?
  return y
end`);
      expect(errors).toEqual([]);
    });
  });

  describe("function call arity", () => {
    it("detects too few arguments", () => {
      const errors = check(`define add(a: Number, b: Number) -> Number as
  return a + b
end

define test() -> Number as
  return add(1)
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("expects 2 argument(s)");
      expect(errors[0].message).toContain("got 1");
    });

    it("detects too many arguments", () => {
      const errors = check(`define add(a: Number, b: Number) -> Number as
  return a + b
end

define test() -> Number as
  return add(1, 2, 3)
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("expects 2 argument(s)");
      expect(errors[0].message).toContain("got 3");
    });

    it("allows correct number of arguments", () => {
      const errors = check(`define add(a: Number, b: Number) -> Number as
  return a + b
end

define test() -> Number as
  return add(1, 2)
end`);
      expect(errors).toEqual([]);
    });
  });

  describe("unknown types", () => {
    it("rejects unknown type in parameter", () => {
      const errors = check(`define test(x: Foo) -> Number as
  return 1
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Unknown type 'Foo'");
    });

    it("rejects unknown type in return position", () => {
      const errors = check(`define test(x: Number) -> Foo as
  return x
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Unknown type 'Foo'");
    });

    it("rejects unknown generic type", () => {
      const errors = check(`define test(x: Foo<Number>) -> Number as
  return 1
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Unknown generic type 'Foo'");
    });
  });

  describe("duplicate definitions", () => {
    it("detects duplicate function names", () => {
      const errors = check(`define test() -> Number as
  return 1
end

define test() -> Text as
  return "hi"
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Duplicate function definition 'test'");
    });

    it("detects duplicate struct names", () => {
      const errors = check(`struct Point has
  x: Number
end

struct Point has
  y: Number
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Duplicate struct definition 'Point'");
    });

    it("detects duplicate struct fields", () => {
      const errors = check(`struct Point has
  x: Number
  x: Number
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Duplicate field 'x'");
    });

    it("detects duplicate parameters", () => {
      const errors = check(`define test(x: Number, x: Text) -> Number as
  return 1
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Duplicate parameter 'x'");
    });
  });

  describe("struct construction", () => {
    it("detects unknown fields in struct construction", () => {
      const errors = check(`struct Point has
  x: Number
  y: Number
end

define test() -> Point as
  return Point(x: 1, y: 2, z: 3)
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Unknown field 'z'");
    });

    it("detects missing required fields", () => {
      const errors = check(`struct Point has
  x: Number
  y: Number
end

define test() -> Point as
  return Point(x: 1)
end`);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Missing field 'y'");
    });
  });
});

describe("exhaustive match checking", () => {
  it("reports missing variants in match on enum", () => {
    const errors = check(`enum Color is
  Red
  Green
  Blue
end

define describe_color(c: Color) -> Text as
  match c on
    case Red => return "red"
    case Green => return "green"
  end
end`);
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("Non-exhaustive match");
    expect(errors[0].message).toContain("Blue");
  });

  it("accepts exhaustive match with all variants", () => {
    const errors = check(`enum Color is
  Red
  Green
  Blue
end

define describe_color(c: Color) -> Text as
  match c on
    case Red => return "red"
    case Green => return "green"
    case Blue => return "blue"
  end
end`);
    expect(errors).toEqual([]);
  });

  it("accepts match with wildcard pattern", () => {
    const errors = check(`enum Color is
  Red
  Green
  Blue
end

define describe_color(c: Color) -> Text as
  match c on
    case Red => return "red"
    case _ => return "other"
  end
end`);
    expect(errors).toEqual([]);
  });

  it("accepts match with identifier catch-all", () => {
    const errors = check(`enum Color is
  Red
  Green
  Blue
end

define describe_color(c: Color) -> Text as
  match c on
    case Red => return "red"
    case other => return "other"
  end
end`);
    expect(errors).toEqual([]);
  });
});

describe("built-in constructors", () => {
  it("ok() infers Result type", () => {
    const errors = check(`define test() -> Result<Number, Error> as
  return ok(42)
end`);
    expect(errors).toEqual([]);
  });

  it("err() infers Result type", () => {
    const errors = check(`define test() -> Result<Number, Text> as
  return err("oops")
end`);
    expect(errors).toEqual([]);
  });

  it("none infers Maybe type", () => {
    const errors = check(`define test() -> Maybe<Number> as
  return none
end`);
    expect(errors).toEqual([]);
  });

  it("some() infers Maybe type", () => {
    const errors = check(`define test() -> Maybe<Number> as
  return some(42)
end`);
    expect(errors).toEqual([]);
  });
});

describe("PropagateExpr emission", () => {
  it("emits __propagateResult helper and try-catch wrapper", () => {
    const output = compileToTS(`define fallible() -> Result<Number, Error> as
  return 1
end

define test(x: Result<Number, Error>) -> Number as
  y = x?
  return y
end`);

    expect(output).toContain("function __propagateResult");
    expect(output).toContain("try {");
    expect(output).toContain("__propagateResult(x)");
    expect(output).toContain("__lithoPropagate");
  });

  it("does not emit try-catch for functions without propagation", () => {
    const output = compileToTS(`define add(a: Number, b: Number) -> Number as
  return a + b
end`);

    expect(output).not.toContain("try {");
    expect(output).not.toContain("__propagateResult");
  });
});
