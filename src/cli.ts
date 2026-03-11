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

// TODO: Wire up Lexer → Parser → TypeChecker → Emitter pipeline
console.log("ClarityLang compiler not yet implemented. Use Claude Code to build it!");
