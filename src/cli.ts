#!/usr/bin/env node

/**
 * ClarityLang CLI
 *
 * Usage:
 *   clarity compile <file.clarity>          # Transpile to TypeScript
 *   clarity compile <file.clarity> -o out.ts # Specify output
 *   clarity check <file.clarity>            # Type-check only
 *   clarity fmt <file.clarity>              # Format source
 */

import { readFileSync, writeFileSync } from "fs";
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { TypeChecker } from "./typechecker/typechecker.js";
import { TypeScriptEmitter } from "./emitter/typescript.js";

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log(`
ClarityLang v0.1.0

Usage:
  clarity compile <file.clarity>    Transpile to TypeScript
  clarity check <file.clarity>      Type-check only
  clarity fmt <file.clarity>        Format source
  `);
  process.exit(0);
}

const file = args[1];
if (!file) {
  console.error(`Error: No input file specified.`);
  process.exit(1);
}

function compile(sourcePath: string): string {
  const source = readFileSync(sourcePath, "utf-8");
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();

  const checker = new TypeChecker();
  const typeErrors = checker.check(ast);
  if (typeErrors.length > 0) {
    const messages = typeErrors.map(
      (e) => `  ${e.position.line}:${e.position.column}: ${e.message}`
    );
    throw new Error(`Type errors:\n${messages.join("\n")}`);
  }

  const emitter = new TypeScriptEmitter();
  return emitter.emit(ast);
}

switch (command) {
  case "compile": {
    try {
      const output = compile(file);
      const outputFlag = args.indexOf("-o");
      if (outputFlag !== -1 && args[outputFlag + 1]) {
        writeFileSync(args[outputFlag + 1], output);
        console.log(`Compiled ${file} → ${args[outputFlag + 1]}`);
      } else {
        const outPath = file.replace(/\.clarity$/, ".ts");
        writeFileSync(outPath, output);
        console.log(`Compiled ${file} → ${outPath}`);
      }
    } catch (err) {
      console.error(`Compile error: ${(err as Error).message}`);
      process.exit(1);
    }
    break;
  }

  case "check": {
    try {
      compile(file);
      console.log(`${file}: OK`);
    } catch (err) {
      console.error(`Check failed: ${(err as Error).message}`);
      process.exit(1);
    }
    break;
  }

  case "fmt": {
    console.log("Formatter not yet implemented.");
    break;
  }

  default: {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
