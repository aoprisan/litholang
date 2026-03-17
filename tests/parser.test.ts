import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { Parser } from "../src/parser/parser.js";
import { Program } from "../src/parser/ast.js";

function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe("Parser", () => {
  it("parses a simple function definition", () => {
    const ast = parse(`define greet(name: Text) -> Text as
  return "Hello"
end`);

    expect(ast.declarations).toHaveLength(1);
    const func = ast.declarations[0];
    expect(func.kind).toBe("FunctionDef");
    if (func.kind === "FunctionDef") {
      expect(func.name).toBe("greet");
      expect(func.params).toHaveLength(1);
      expect(func.params[0].name).toBe("name");
      expect(func.returnType?.kind).toBe("SimpleType");
    }
  });

  it("parses function with annotations", () => {
    const ast = parse(`@purpose "Say hello"
@example "greet('World')"
define greet(name: Text) -> Text as
  return "Hello"
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.annotations).toHaveLength(2);
      expect(func.annotations[0].name).toBe("purpose");
      expect(func.annotations[0].value).toBe("Say hello");
      expect(func.annotations[1].name).toBe("example");
    }
  });

  it("parses struct definition", () => {
    const ast = parse(`struct Point has
  x: Number
  y: Number
end`);

    expect(ast.declarations).toHaveLength(1);
    const struct = ast.declarations[0];
    expect(struct.kind).toBe("StructDef");
    if (struct.kind === "StructDef") {
      expect(struct.name).toBe("Point");
      expect(struct.fields).toHaveLength(2);
      expect(struct.fields[0].name).toBe("x");
      expect(struct.fields[1].name).toBe("y");
    }
  });

  it("parses enum definition", () => {
    const ast = parse(`enum Color is
  Red
  Green
  Blue
end`);

    expect(ast.declarations).toHaveLength(1);
    const enumDef = ast.declarations[0];
    expect(enumDef.kind).toBe("EnumDef");
    if (enumDef.kind === "EnumDef") {
      expect(enumDef.name).toBe("Color");
      expect(enumDef.variants).toEqual(["Red", "Green", "Blue"]);
    }
  });

  it("parses import declaration", () => {
    const ast = parse(`import foo, bar from "module"`);

    const decl = ast.declarations[0];
    expect(decl.kind).toBe("ImportDecl");
    if (decl.kind === "ImportDecl") {
      expect(decl.names).toEqual(["foo", "bar"]);
      expect(decl.source).toBe("module");
    }
  });

  it("parses type alias", () => {
    const ast = parse(`type UserId = Number`);

    const decl = ast.declarations[0];
    expect(decl.kind).toBe("TypeAlias");
    if (decl.kind === "TypeAlias") {
      expect(decl.name).toBe("UserId");
      if (decl.type.kind === "SimpleType") {
        expect(decl.type.name).toBe("Number");
      }
    }
  });

  it("parses if-then-else", () => {
    const ast = parse(`define test() -> Number as
  if x > 0 then
    return 1
  else
    return 0
  end
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.body).toHaveLength(1);
      expect(func.body[0].kind).toBe("IfStatement");
    }
  });

  it("parses for loop", () => {
    const ast = parse(`define test(items: List<Number>) -> Void as
  for item in items do
    x = item
  end
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.body[0].kind).toBe("ForStatement");
      if (func.body[0].kind === "ForStatement") {
        expect(func.body[0].variable).toBe("item");
      }
    }
  });

  it("parses match statement", () => {
    const ast = parse(`define test(x: Number) -> Text as
  match x on
    case 1 => "one"
    case 2 => "two"
    case _ => "other"
  end
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.body[0].kind).toBe("MatchStatement");
      if (func.body[0].kind === "MatchStatement") {
        expect(func.body[0].cases).toHaveLength(3);
      }
    }
  });

  it("parses check statement", () => {
    const ast = parse(`define test(x: Number) -> Number as
  check x > 0 or return 0
  return x
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.body[0].kind).toBe("CheckStatement");
    }
  });

  it("parses pipeline expression", () => {
    const ast = parse(`define test(data: List<Number>) -> List<Number> as
  result = data |> filter(x) |> sort(y)
  return result
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.body[0].kind).toBe("Assignment");
      if (func.body[0].kind === "Assignment") {
        expect(func.body[0].value.kind).toBe("PipelineExpr");
      }
    }
  });

  it("parses binary and comparison expressions", () => {
    const ast = parse(`define test(a: Number, b: Number) -> Boolean as
  return a + b * 2 > 10
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const ret = func.body[0];
      if (ret.kind === "ReturnStatement") {
        // Should be: (a + (b * 2)) > 10
        expect(ret.value.kind).toBe("BinaryExpr");
      }
    }
  });

  it("parses generic types", () => {
    const ast = parse(`define test(items: List<Number>) -> Result<Text, Error> as
  return "ok"
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const paramType = func.params[0].type;
      expect(paramType.kind).toBe("GenericType");
      if (paramType.kind === "GenericType") {
        expect(paramType.name).toBe("List");
        expect(paramType.typeArgs).toHaveLength(1);
      }

      const retType = func.returnType;
      expect(retType?.kind).toBe("GenericType");
      if (retType?.kind === "GenericType") {
        expect(retType.name).toBe("Result");
        expect(retType.typeArgs).toHaveLength(2);
      }
    }
  });

  it("parses async function", () => {
    const ast = parse(`async define fetch_data(url: Text) -> Result<Text, Error> as
  return "data"
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.isAsync).toBe(true);
      expect(func.name).toBe("fetch_data");
    }
  });

  it("parses await expression", () => {
    const ast = parse(`async define fetch_data(url: Text) -> Text as
  result = await get(url)
  return result
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.isAsync).toBe(true);
      const assign = func.body[0];
      if (assign.kind === "Assignment") {
        expect(assign.value.kind).toBe("AwaitExpr");
        if (assign.value.kind === "AwaitExpr") {
          expect(assign.value.expr.kind).toBe("CallExpr");
        }
      }
    }
  });

  it("parses all expression", () => {
    const ast = parse(`async define fetch_all(a: Text, b: Text) -> List<Text> as
  results = all [get(a), get(b)]
  return results
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const assign = func.body[0];
      if (assign.kind === "Assignment") {
        expect(assign.value.kind).toBe("AllExpr");
        if (assign.value.kind === "AllExpr") {
          expect(assign.value.exprs).toHaveLength(2);
        }
      }
    }
  });

  it("parses with expression", () => {
    const ast = parse(`define test(p: Point) -> Point as
  return p with x: 10, y: 20
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const ret = func.body[0];
      if (ret.kind === "ReturnStatement") {
        expect(ret.value.kind).toBe("WithExpr");
      }
    }
  });

  it("parses list literal", () => {
    const ast = parse(`define test() -> List<Number> as
  return [1, 2, 3]
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const ret = func.body[0];
      if (ret.kind === "ReturnStatement") {
        expect(ret.value.kind).toBe("ListLiteral");
        if (ret.value.kind === "ListLiteral") {
          expect(ret.value.elements).toHaveLength(3);
        }
      }
    }
  });

  it("parses match with pattern guard", () => {
    const ast = parse(`define test(x: Number) -> Text as
  match x on
    case n where n >= 18 => "adult"
    case _ => "minor"
  end
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const match = func.body[0];
      if (match.kind === "MatchStatement") {
        expect(match.cases).toHaveLength(2);
        expect(match.cases[0].guard).toBeDefined();
        expect(match.cases[0].guard?.kind).toBe("BinaryExpr");
        expect(match.cases[1].guard).toBeUndefined();
      }
    }
  });

  it("parses default parameter values", () => {
    const ast = parse(`define greet(name: Text, greeting: Text = "Hello") -> Text as
  return greeting
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.params).toHaveLength(2);
      expect(func.params[0].defaultValue).toBeUndefined();
      expect(func.params[1].defaultValue).toBeDefined();
      expect(func.params[1].defaultValue?.kind).toBe("TextLiteral");
    }
  });

  it("parses multi-line pipeline", () => {
    const ast = parse(`define test(data: List<Number>) -> List<Number> as
  result = data
    |> filter(x)
    |> sort(y)
  return result
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      expect(func.body[0].kind).toBe("Assignment");
      if (func.body[0].kind === "Assignment") {
        expect(func.body[0].value.kind).toBe("PipelineExpr");
        if (func.body[0].value.kind === "PipelineExpr") {
          expect(func.body[0].value.steps).toHaveLength(2);
        }
      }
    }
  });

  it("parses tuple expression", () => {
    const ast = parse(`define test(x: Number, y: Text) -> Void as
  t = (x, y)
  return t
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const assign = func.body[0];
      if (assign.kind === "Assignment") {
        expect(assign.value.kind).toBe("TupleExpr");
        if (assign.value.kind === "TupleExpr") {
          expect(assign.value.elements).toHaveLength(2);
        }
      }
    }
  });

  it("parses tuple pattern in match", () => {
    const ast = parse(`define test(x: Number, y: Text) -> Text as
  match (x, y) on
    case (1, "hello") => return "match"
    case (_, _) => return "other"
  end
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const match = func.body[0];
      if (match.kind === "MatchStatement") {
        expect(match.subject.kind).toBe("TupleExpr");
        expect(match.cases).toHaveLength(2);
        expect(match.cases[0].pattern.kind).toBe("TuplePattern");
        if (match.cases[0].pattern.kind === "TuplePattern") {
          expect(match.cases[0].pattern.elements).toHaveLength(2);
        }
      }
    }
  });

  it("parses where keyword in pipeline args", () => {
    const ast = parse(`define test(items: List<Number>) -> List<Number> as
  result = items |> filter(where .active == true)
  return result
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const assign = func.body[0];
      if (assign.kind === "Assignment") {
        expect(assign.value.kind).toBe("PipelineExpr");
        if (assign.value.kind === "PipelineExpr") {
          const step = assign.value.steps[0];
          expect(step.args).toHaveLength(1);
          expect(step.args[0].value.kind).toBe("LambdaExpr");
        }
      }
    }
  });

  it("parses of keyword in pipeline args", () => {
    const ast = parse(`define test(items: List<Number>) -> Number as
  result = items |> sum(of .amount)
  return result
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const assign = func.body[0];
      if (assign.kind === "Assignment" && assign.value.kind === "PipelineExpr") {
        const step = assign.value.steps[0];
        expect(step.args[0].value.kind).toBe("LambdaExpr");
      }
    }
  });

  it("parses by keyword in pipeline args", () => {
    const ast = parse(`define test(items: List<Number>) -> List<Number> as
  result = items |> sort(by .name)
  return result
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const assign = func.body[0];
      if (assign.kind === "Assignment" && assign.value.kind === "PipelineExpr") {
        const step = assign.value.steps[0];
        expect(step.args[0].value.kind).toBe("LambdaExpr");
      }
    }
  });

  it("parses multi-line constructor call", () => {
    const ast = parse(`struct Point has
  x: Number
  y: Number
end

define test() -> Point as
  return Point(
    x: 10,
    y: 20
  )
end`);

    const func = ast.declarations[1];
    if (func.kind === "FunctionDef") {
      const ret = func.body[0];
      if (ret.kind === "ReturnStatement") {
        expect(ret.value.kind).toBe("ConstructExpr");
        if (ret.value.kind === "ConstructExpr") {
          expect(ret.value.fields).toHaveLength(2);
        }
      }
    }
  });

  it("parses multi-line function call", () => {
    const ast = parse(`define test() -> Void as
  result = some_func(
    1,
    2,
    3
  )
  return result
end`);

    const func = ast.declarations[0];
    if (func.kind === "FunctionDef") {
      const assign = func.body[0];
      if (assign.kind === "Assignment") {
        expect(assign.value.kind).toBe("CallExpr");
        if (assign.value.kind === "CallExpr") {
          expect(assign.value.args).toHaveLength(3);
        }
      }
    }
  });

  it("parses multiple declarations", () => {
    const ast = parse(`struct Point has
  x: Number
  y: Number
end

define origin() -> Point as
  return Point(x: 0, y: 0)
end`);

    expect(ast.declarations).toHaveLength(2);
    expect(ast.declarations[0].kind).toBe("StructDef");
    expect(ast.declarations[1].kind).toBe("FunctionDef");
  });
});
