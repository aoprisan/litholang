import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/lexer.js";
import { TokenKind } from "../src/lexer/tokens.js";
import { Parser } from "../src/parser/parser.js";
import { TypeChecker } from "../src/typechecker/typechecker.js";
import { TypeScriptEmitter } from "../src/emitter/typescript.js";

function compileToTS(source: string): string {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const emitter = new TypeScriptEmitter();
  return emitter.emit(ast);
}

function typeCheck(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const checker = new TypeChecker();
  return checker.check(ast);
}

describe("Lexer - extern keyword", () => {
  it("tokenizes extern as a keyword", () => {
    const lexer = new Lexer("extern");
    const tokens = lexer.tokenize();
    expect(tokens[0].kind).toBe(TokenKind.Extern);
    expect(tokens[0].value).toBe("extern");
  });
});

describe("Parser - extern declarations", () => {
  it("parses a basic extern define", () => {
    const source = `extern define readFile(path: Text) -> Text
  from "fs"
end`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    expect(ast.declarations).toHaveLength(1);
    const decl = ast.declarations[0];
    expect(decl.kind).toBe("ExternDef");
    if (decl.kind === "ExternDef") {
      expect(decl.name).toBe("readFile");
      expect(decl.params).toHaveLength(1);
      expect(decl.params[0].name).toBe("path");
      expect(decl.returnType).not.toBeNull();
      expect(decl.source).toBe("fs");
      expect(decl.isAsync).toBe(false);
    }
  });

  it("parses async extern define", () => {
    const source = `extern async define fetch(url: Text) -> Text
  from "node-fetch"
end`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const decl = ast.declarations[0];
    expect(decl.kind).toBe("ExternDef");
    if (decl.kind === "ExternDef") {
      expect(decl.name).toBe("fetch");
      expect(decl.isAsync).toBe(true);
    }
  });

  it("parses extern with multiple params", () => {
    const source = `extern define writeFile(path: Text, data: Text) -> Void
  from "fs"
end`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const decl = ast.declarations[0];
    if (decl.kind === "ExternDef") {
      expect(decl.params).toHaveLength(2);
      expect(decl.params[0].name).toBe("path");
      expect(decl.params[1].name).toBe("data");
    }
  });

  it("parses extern with no return type", () => {
    const source = `extern define log(msg: Text)
  from "console"
end`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const decl = ast.declarations[0];
    if (decl.kind === "ExternDef") {
      expect(decl.returnType).toBeNull();
    }
  });

  it("parses extern with generic return type", () => {
    const source = `extern define parse(json: Text) -> Result<Map<Text, Text>, Error>
  from "json-utils"
end`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const decl = ast.declarations[0];
    if (decl.kind === "ExternDef") {
      expect(decl.returnType).not.toBeNull();
      expect(decl.returnType!.kind).toBe("GenericType");
    }
  });

  it("parses extern with annotations", () => {
    const source = `@purpose "Read file contents"
extern define readFile(path: Text) -> Text
  from "fs"
end`;
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const decl = ast.declarations[0];
    if (decl.kind === "ExternDef") {
      expect(decl.annotations).toHaveLength(1);
      expect(decl.annotations[0].name).toBe("purpose");
      expect(decl.annotations[0].value).toBe("Read file contents");
    }
  });
});

describe("TypeChecker - extern declarations", () => {
  it("validates extern parameter types", () => {
    const errors = typeCheck(`extern define readFile(path: Text) -> Text
  from "fs"
end`);
    expect(errors).toHaveLength(0);
  });

  it("reports unknown types in extern params", () => {
    const errors = typeCheck(`extern define readFile(path: Foo) -> Text
  from "fs"
end`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("Unknown type 'Foo'");
  });

  it("reports unknown return type in extern", () => {
    const errors = typeCheck(`extern define readFile(path: Text) -> Foo
  from "fs"
end`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("Unknown type 'Foo'");
  });

  it("allows calling extern functions from other functions", () => {
    const errors = typeCheck(`extern define readFile(path: Text) -> Text
  from "fs"
end

define main() -> Text as
  return readFile("hello.txt")
end`);
    expect(errors).toHaveLength(0);
  });

  it("validates arg count when calling extern functions", () => {
    const errors = typeCheck(`extern define readFile(path: Text) -> Text
  from "fs"
end

define main() -> Text as
  return readFile("a", "b")
end`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("expects 1 argument(s), got 2");
  });

  it("reports duplicate extern/function names", () => {
    const errors = typeCheck(`define readFile(path: Text) -> Text as
  return path
end

extern define readFile(path: Text) -> Text
  from "fs"
end`);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("Duplicate function definition");
  });
});

describe("TypeScriptEmitter - extern declarations", () => {
  it("emits extern as import statement", () => {
    const output = compileToTS(`extern define readFile(path: Text) -> Text
  from "fs"
end`);
    expect(output).toContain('import { readFile } from "fs";');
  });

  it("emits async extern as import", () => {
    const output = compileToTS(`extern async define fetch(url: Text) -> Text
  from "node-fetch"
end`);
    expect(output).toContain('import { fetch } from "node-fetch";');
  });

  it("emits extern alongside regular functions", () => {
    const output = compileToTS(`extern define readFile(path: Text) -> Text
  from "fs"
end

define greet(name: Text) -> Text as
  return name
end`);
    expect(output).toContain('import { readFile } from "fs";');
    expect(output).toContain("function greet(name: string): string {");
  });

  it("emits multiple externs from different modules", () => {
    const output = compileToTS(`extern define readFile(path: Text) -> Text
  from "fs"
end

extern define resolve(path: Text) -> Text
  from "path"
end`);
    expect(output).toContain('import { readFile } from "fs";');
    expect(output).toContain('import { resolve } from "path";');
  });
});
