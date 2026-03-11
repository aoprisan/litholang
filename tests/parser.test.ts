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
