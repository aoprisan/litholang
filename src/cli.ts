#!/usr/bin/env node

/**
 * LithoLang CLI
 *
 * Usage:
 *   litho compile <file.litho>          # Transpile to TypeScript
 *   litho compile <file.litho> -o out.ts # Specify output
 *   litho check <file.litho>            # Type-check only
 *   litho fmt <file.litho>              # Format source
 */

import { readFileSync, writeFileSync } from "fs";
import { Lexer } from "./lexer/lexer.js";
import { Parser } from "./parser/parser.js";
import { TypeChecker } from "./typechecker/typechecker.js";
import { TypeScriptEmitter } from "./emitter/typescript.js";
import { Formatter } from "./formatter/formatter.js";
import { formatDiagnostics } from "./diagnostics.js";

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log(`
LithoLang v0.1.0

Usage:
  litho compile <file.litho>    Transpile to TypeScript
  litho check <file.litho>      Type-check only
  litho fmt <file.litho>        Format source
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
    throw new Error(formatDiagnostics(source, sourcePath, typeErrors));
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
        const outPath = file.replace(/\.litho$/, ".ts");
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
    try {
      const source = readFileSync(file, "utf-8");
      const lexer = new Lexer(source);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens);
      const ast = parser.parse();
      const formatter = new Formatter();
      const formatted = formatter.format(ast);

      const writeBack = args.includes("--check") ? false : true;
      if (writeBack) {
        writeFileSync(file, formatted);
        console.log(`Formatted ${file}`);
      } else {
        if (source !== formatted) {
          console.log(`${file}: needs formatting`);
          process.exit(1);
        }
        console.log(`${file}: OK`);
      }
    } catch (err) {
      console.error(`Format error: ${(err as Error).message}`);
      process.exit(1);
    }
    break;
  }

  default: {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}
