import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Hover,
  MarkupKind,
  TextDocumentPositionParams,
  CompletionItem,
  CompletionItemKind,
  Location,
  DocumentSymbol,
  SymbolKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
// Import from the vendored compiler lib (copied during build)
import {
  Lexer,
  Parser,
  TypeChecker,
  TypeScriptEmitter,
} from "../lib/litholang";
import type { Program } from "../lib/litholang";

const execFileAsync = promisify(execFile);

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// --- Symbol index types ---

interface SymbolDef {
  name: string;
  kind: "function" | "struct" | "enum" | "typeAlias" | "extern" | "import" | "variable" | "parameter";
  line: number;   // 1-indexed (from AST)
  column: number;
}

interface SymbolIndex {
  definitions: Map<string, SymbolDef>;
  fields: Map<string, SymbolDef>;        // "Struct.field" -> def
  variants: Map<string, SymbolDef>;      // "Enum.Variant" -> def
  locals: Map<string, Map<string, SymbolDef>>; // funcName -> (varName -> def)
  ast: Program;
}

function buildSymbolIndex(ast: Program): SymbolIndex {
  const definitions = new Map<string, SymbolDef>();
  const fields = new Map<string, SymbolDef>();
  const variants = new Map<string, SymbolDef>();
  const locals = new Map<string, Map<string, SymbolDef>>();

  for (const decl of ast.declarations) {
    switch (decl.kind) {
      case "FunctionDef": {
        definitions.set(decl.name, {
          name: decl.name,
          kind: "function",
          line: decl.position.line,
          column: decl.position.column,
        });
        const funcLocals = new Map<string, SymbolDef>();
        // Store params (position approximated to function position)
        for (const param of decl.params) {
          funcLocals.set(param.name, {
            name: param.name,
            kind: "parameter",
            line: decl.position.line,
            column: decl.position.column,
          });
        }
        // Walk body for assignments (first occurrence)
        walkBodyForLocals(decl.body, funcLocals);
        locals.set(decl.name, funcLocals);
        break;
      }
      case "StructDef": {
        definitions.set(decl.name, {
          name: decl.name,
          kind: "struct",
          line: decl.position.line,
          column: decl.position.column,
        });
        for (const field of decl.fields) {
          fields.set(`${decl.name}.${field.name}`, {
            name: field.name,
            kind: "variable",
            line: decl.position.line,
            column: decl.position.column,
          });
        }
        for (const method of decl.methods) {
          definitions.set(`${decl.name}.${method.name}`, {
            name: method.name,
            kind: "function",
            line: method.position.line,
            column: method.position.column,
          });
        }
        break;
      }
      case "EnumDef": {
        definitions.set(decl.name, {
          name: decl.name,
          kind: "enum",
          line: decl.position.line,
          column: decl.position.column,
        });
        for (const variant of decl.variants) {
          variants.set(`${decl.name}.${variant.name}`, {
            name: variant.name,
            kind: "enum",
            line: decl.position.line,
            column: decl.position.column,
          });
          // Also register variant by bare name for pattern matching
          if (!definitions.has(variant.name)) {
            variants.set(variant.name, {
              name: variant.name,
              kind: "enum",
              line: decl.position.line,
              column: decl.position.column,
            });
          }
        }
        break;
      }
      case "TypeAlias": {
        definitions.set(decl.name, {
          name: decl.name,
          kind: "typeAlias",
          line: decl.position.line,
          column: decl.position.column,
        });
        break;
      }
      case "ExternDef": {
        definitions.set(decl.name, {
          name: decl.name,
          kind: "extern",
          line: decl.position.line,
          column: decl.position.column,
        });
        break;
      }
      case "ImportDecl": {
        for (const name of decl.names) {
          definitions.set(name, {
            name,
            kind: "import",
            line: decl.position.line,
            column: decl.position.column,
          });
        }
        break;
      }
    }
  }

  return { definitions, fields, variants, locals, ast };
}

function walkBodyForLocals(
  statements: any[],
  funcLocals: Map<string, SymbolDef>,
): void {
  for (const stmt of statements) {
    if (stmt.kind === "Assignment" && !funcLocals.has(stmt.target)) {
      funcLocals.set(stmt.target, {
        name: stmt.target,
        kind: "variable",
        line: stmt.position.line,
        column: stmt.position.column,
      });
    }
    // Recurse into nested blocks
    if (stmt.body) walkBodyForLocals(stmt.body, funcLocals);
    if (stmt.elseBody) walkBodyForLocals(stmt.elseBody, funcLocals);
    if (stmt.cases) {
      for (const c of stmt.cases) {
        if (c.body) walkBodyForLocals(Array.isArray(c.body) ? c.body : [c.body], funcLocals);
      }
    }
  }
}

// Cache the latest type info per document for hover
const typeInfoCache = new Map<
  string,
  { checker: TypeChecker; source: string; symbols?: SymbolIndex }
>();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      hoverProvider: true,
      completionProvider: {
        triggerCharacters: [".", "|", "@"],
      },
      definitionProvider: true,
      documentSymbolProvider: true,
    },
  };
});

// Validate on open and change
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

function validateDocument(document: TextDocument): void {
  const source = document.getText();
  const diagnostics: Diagnostic[] = [];

  let ast;
  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    ast = parser.parse();

    const checker = new TypeChecker();
    const typeErrors = checker.check(ast);

    // Cache for hover and navigation
    const symbols = buildSymbolIndex(ast);
    typeInfoCache.set(document.uri, { checker, source, symbols });

    for (const err of typeErrors) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: {
            line: Math.max(0, err.position.line - 1),
            character: Math.max(0, err.position.column - 1),
          },
          end: {
            line: Math.max(0, err.position.line - 1),
            character: err.position.column + 10,
          },
        },
        message: err.message,
        source: "litho",
      });
    }
  } catch (e) {
    // Parse errors
    const msg = (e as Error).message;
    const match = msg.match(/at (\d+):(\d+)/);
    const line = match ? parseInt(match[1], 10) - 1 : 0;
    const col = match ? parseInt(match[2], 10) - 1 : 0;

    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line, character: col },
        end: { line, character: col + 1 },
      },
      message: msg,
      source: "litho",
    });
  }

  // Send Litho diagnostics immediately
  connection.sendDiagnostics({ uri: document.uri, diagnostics });

  // Run TypeScript validation in the background if we have a valid AST
  if (ast) {
    validateTypeScript(document, ast, diagnostics);
  }
}

/**
 * Emit TypeScript from the AST, run tsc --noEmit, and map errors back to Litho source lines.
 */
async function validateTypeScript(
  document: TextDocument,
  ast: import("../lib/litholang").Program,
  lithoDiagnostics: Diagnostic[],
): Promise<void> {
  let tmpDir: string | undefined;
  try {
    const emitter = new TypeScriptEmitter();
    const { code, lineMap } = emitter.emitWithLineMap(ast);

    // Resolve the document's directory for module resolution
    const docUri = document.uri;
    const docDir = docUri.startsWith("file://")
      ? path.dirname(docUri.replace("file://", ""))
      : os.tmpdir();

    // Write emitted TS to a temp file next to the source for correct module resolution
    tmpDir = fs.mkdtempSync(path.join(docDir, ".litho-tsc-"));
    const tsFile = path.join(tmpDir, "check.ts");
    fs.writeFileSync(tsFile, code);

    // Write a minimal tsconfig for the check
    const tsconfig = {
      compilerOptions: {
        target: "ES2022",
        module: "ES2022",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ["node"],
      },
      files: ["check.ts"],
    };
    fs.writeFileSync(
      path.join(tmpDir, "tsconfig.json"),
      JSON.stringify(tsconfig),
    );

    // Find tsc — try npx first, then global
    const tscPath = await findTsc(docDir);
    if (!tscPath) return;

    const { stdout } = await execFileAsync(tscPath, ["--noEmit", "--pretty", "false", "-p", tmpDir], {
      cwd: tmpDir,
      timeout: 10000,
    }).catch((err: { stdout?: string }) => ({ stdout: err.stdout ?? "" }));

    // Parse tsc output: "check.ts(line,col): error TSxxxx: message"
    const tsDiagnostics = parseTscOutput(stdout as string, lineMap);

    // Merge with existing Litho diagnostics
    const allDiagnostics = [...lithoDiagnostics, ...tsDiagnostics];
    connection.sendDiagnostics({ uri: document.uri, diagnostics: allDiagnostics });
  } catch {
    // TypeScript validation is best-effort — don't block Litho diagnostics
  } finally {
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
    }
  }
}

/**
 * Find tsc binary — check local node_modules first, then global.
 */
async function findTsc(cwd: string): Promise<string | null> {
  // Walk up from cwd looking for node_modules/.bin/tsc
  let dir = cwd;
  while (true) {
    const candidate = path.join(dir, "node_modules", ".bin", "tsc");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Try global tsc
  try {
    await execFileAsync("tsc", ["--version"], { timeout: 3000 });
    return "tsc";
  } catch {
    return null;
  }
}

/**
 * Parse tsc output lines into LSP diagnostics, mapping TS lines back to Litho source lines.
 */
function parseTscOutput(output: string, lineMap: number[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const regex = /^check\.ts\((\d+),(\d+)\): (error|warning) TS\d+: (.+)$/gm;
  let match;

  while ((match = regex.exec(output)) !== null) {
    const tsLine = parseInt(match[1], 10);
    const tsCol = parseInt(match[2], 10);
    const severity = match[3] === "error" ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
    const message = match[4];

    // Map TS line back to Litho source line
    const lithoLine = lineMap[tsLine] ?? 0;
    if (lithoLine === 0) continue; // Skip errors in runtime/helper code

    diagnostics.push({
      severity,
      range: {
        start: { line: lithoLine - 1, character: Math.max(0, tsCol - 1) },
        end: { line: lithoLine - 1, character: tsCol + 10 },
      },
      message: `[TypeScript] ${message}`,
      source: "litho-tsc",
    });
  }

  return diagnostics;
}

// Hover: show type information for identifiers
connection.onHover(
  (params: TextDocumentPositionParams): Hover | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const line = document.getText({
      start: { line: params.position.line, character: 0 },
      end: { line: params.position.line + 1, character: 0 },
    });

    // Extract the word under cursor
    const col = params.position.character;
    const wordMatch = getWordAtPosition(line, col);
    if (!wordMatch) return null;

    const word = wordMatch.word;

    // Check built-in types
    const builtinTypes: Record<string, string> = {
      Text: "Built-in type: UTF-8 string",
      Number: "Built-in type: 64-bit floating point number",
      Boolean: "Built-in type: true or false",
      Void: "Built-in type: no value",
      List: "Built-in generic: ordered collection — `List<T>`",
      Map: "Built-in generic: key-value collection — `Map<K, V>`",
      Set: "Built-in generic: unique element collection — `Set<T>`",
      Maybe: "Built-in generic: optional value — `Maybe<T>` (some/none)",
      Result: "Built-in generic: error-or-value — `Result<T, E>` (ok/err)",
      Tuple: "Built-in generic: fixed-size heterogeneous collection — `Tuple<A, B>`",
      Duration: "Built-in type: time duration",
      Date: "Built-in type: calendar date",
      Timestamp: "Built-in type: date with time",
    };

    if (builtinTypes[word]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${word}**\n\n${builtinTypes[word]}`,
        },
      };
    }

    // Check keywords
    const keywordDocs: Record<string, string> = {
      define: "Declare a function: `define name(param: Type) -> ReturnType as ... end`",
      struct: "Declare a struct: `struct Name has ... end`",
      enum: "Declare an enum: `enum Name is ... end`",
      match: "Pattern match: `match expr on case pattern => result end`",
      check: "Guard clause: `check condition or return fallback`",
      extern: "Foreign function: `extern define name(...) from \"module\" end`",
      import: "Import: `import Name from \"module\"`",
    };

    if (keywordDocs[word]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${word}** *(keyword)*\n\n${keywordDocs[word]}`,
        },
      };
    }

    // Check built-in functions
    const builtinFnDocs: Record<string, string> = {
      ok: "`ok(value)` → Wrap value in `Result.Ok`",
      err: "`err(error)` → Wrap error in `Result.Err`",
      some: "`some(value)` → Wrap value in `Maybe.Some`",
      none: "`none` → `Maybe.None`",
      print: "`print(value)` → Print to stdout",
      range: "`range(start, end)` → Generate `List<Number>`",
      filter: "`filter(where .field == val)` → Pipeline: keep matching elements",
      map: "`map(each x => expr)` → Pipeline: transform each element",
      sort: "`sort(by .field)` → Pipeline: sort elements",
      enumerate: "`enumerate()` → Pipeline: `List<T>` → `List<Tuple<Number, T>>`",
      zip: "`zip(other)` → Pipeline: `List<T>` + `List<U>` → `List<Tuple<T, U>>`",
      sum: "`sum(of .field)` → Pipeline: sum numeric values",
      first: "`first` → Get first element of a list",
      last: "`last` → Get last element of a list",
      skip: "`skip(n)` → Pipeline: skip first n elements",
      take: "`take(n)` → Pipeline: take first n elements",
      group: "`group(by .field)` → Pipeline: group elements by field",
      flatten: "`flatten` → Pipeline: flatten nested lists",
      collect: "`collect` → Pipeline: materialize lazy pipeline into a list",
    };

    if (builtinFnDocs[word]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${word}** *(built-in)*\n\n${builtinFnDocs[word]}`,
        },
      };
    }

    return null;
  },
);

// Go to Definition
connection.onDefinition(
  (params: TextDocumentPositionParams): Location | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return null;

    const cached = typeInfoCache.get(params.textDocument.uri);
    if (!cached?.symbols) return null;

    const { symbols } = cached;

    const lineText = document.getText({
      start: { line: params.position.line, character: 0 },
      end: { line: params.position.line + 1, character: 0 },
    });

    const col = params.position.character;
    const wordMatch = getWordAtPosition(lineText, col);
    if (!wordMatch) return null;

    const word = wordMatch.word;
    const uri = params.textDocument.uri;

    const toLocation = (def: SymbolDef): Location => ({
      uri,
      range: {
        start: { line: def.line - 1, character: Math.max(0, def.column - 1) },
        end: { line: def.line - 1, character: def.column - 1 + def.name.length },
      },
    });

    // Check if this is a dot access (e.g., obj.field)
    const charBefore = wordMatch.start > 0 ? lineText[wordMatch.start - 1] : "";
    if (charBefore === ".") {
      // Try to find struct.field match
      for (const [key, def] of symbols.fields) {
        if (key.endsWith(`.${word}`)) {
          return toLocation(def);
        }
      }
    }

    // Find enclosing function and check locals
    const cursorLine = params.position.line + 1; // convert to 1-indexed
    let enclosingFunc: string | null = null;
    let bestLine = 0;
    for (const decl of symbols.ast.declarations) {
      if (decl.kind === "FunctionDef" && decl.position.line <= cursorLine && decl.position.line > bestLine) {
        enclosingFunc = decl.name;
        bestLine = decl.position.line;
      }
    }
    if (enclosingFunc) {
      const funcLocals = symbols.locals.get(enclosingFunc);
      if (funcLocals?.has(word)) {
        return toLocation(funcLocals.get(word)!);
      }
    }

    // Check top-level definitions
    if (symbols.definitions.has(word)) {
      return toLocation(symbols.definitions.get(word)!);
    }

    // Check variants (bare name)
    if (symbols.variants.has(word)) {
      return toLocation(symbols.variants.get(word)!);
    }

    return null;
  },
);

// Document Symbols (outline)
connection.onDocumentSymbol(
  (params): DocumentSymbol[] => {
    const cached = typeInfoCache.get(params.textDocument.uri);
    if (!cached?.symbols) return [];

    const { ast } = cached.symbols;
    const result: DocumentSymbol[] = [];

    for (const decl of ast.declarations) {
      const startLine = decl.position.line - 1;
      const startChar = Math.max(0, decl.position.column - 1);

      switch (decl.kind) {
        case "FunctionDef": {
          result.push(DocumentSymbol.create(
            decl.name,
            decl.isAsync ? "async function" : undefined,
            SymbolKind.Function,
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
          ));
          break;
        }
        case "StructDef": {
          const children: DocumentSymbol[] = [];
          for (const field of decl.fields) {
            children.push(DocumentSymbol.create(
              field.name,
              undefined,
              SymbolKind.Field,
              { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + field.name.length } },
              { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + field.name.length } },
            ));
          }
          for (const method of decl.methods) {
            const mLine = method.position.line - 1;
            const mChar = Math.max(0, method.position.column - 1);
            children.push(DocumentSymbol.create(
              method.name,
              undefined,
              SymbolKind.Method,
              { start: { line: mLine, character: mChar }, end: { line: mLine, character: mChar + method.name.length } },
              { start: { line: mLine, character: mChar }, end: { line: mLine, character: mChar + method.name.length } },
            ));
          }
          result.push(DocumentSymbol.create(
            decl.name,
            undefined,
            SymbolKind.Struct,
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
            children,
          ));
          break;
        }
        case "EnumDef": {
          const children: DocumentSymbol[] = [];
          for (const variant of decl.variants) {
            children.push(DocumentSymbol.create(
              variant.name,
              undefined,
              SymbolKind.EnumMember,
              { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + variant.name.length } },
              { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + variant.name.length } },
            ));
          }
          result.push(DocumentSymbol.create(
            decl.name,
            undefined,
            SymbolKind.Enum,
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
            children,
          ));
          break;
        }
        case "TypeAlias": {
          result.push(DocumentSymbol.create(
            decl.name,
            undefined,
            SymbolKind.TypeParameter,
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
          ));
          break;
        }
        case "ExternDef": {
          result.push(DocumentSymbol.create(
            decl.name,
            "extern",
            SymbolKind.Function,
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
            { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + decl.name.length } },
          ));
          break;
        }
        case "ImportDecl": {
          for (const name of decl.names) {
            result.push(DocumentSymbol.create(
              name,
              `from "${decl.source}"`,
              SymbolKind.Module,
              { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + name.length } },
              { start: { line: startLine, character: startChar }, end: { line: startLine, character: startChar + name.length } },
            ));
          }
          break;
        }
      }
    }

    return result;
  },
);

// Completion: suggest keywords, types, and built-in functions
connection.onCompletion(
  (_params: TextDocumentPositionParams): CompletionItem[] => {
    const keywords = [
      "define", "struct", "enum", "type", "import", "from", "extern", "export",
      "if", "then", "else", "for", "in", "do", "match", "on", "case",
      "return", "check", "end", "async", "await", "repeat", "while",
      "try", "rescue", "and", "or", "not", "is", "as", "has", "with",
      "where", "each", "all", "self", "of", "by", "collect",
    ];

    const types = [
      "Text", "Number", "Boolean", "Void", "List", "Map", "Set",
      "Maybe", "Result", "Tuple", "Duration", "Date", "Timestamp",
    ];

    const builtins = [
      "ok", "err", "some", "none", "print", "range", "filter", "map",
      "sort", "enumerate", "zip", "sum", "first", "last", "skip", "take",
      "group", "flatten", "collect", "contains", "length", "to_text", "to_number",
    ];

    const items: CompletionItem[] = [];

    for (const kw of keywords) {
      items.push({
        label: kw,
        kind: CompletionItemKind.Keyword,
      });
    }

    for (const t of types) {
      items.push({
        label: t,
        kind: CompletionItemKind.Class,
      });
    }

    for (const fn of builtins) {
      items.push({
        label: fn,
        kind: CompletionItemKind.Function,
      });
    }

    return items;
  },
);

function getWordAtPosition(
  line: string,
  col: number,
): { word: string; start: number; end: number } | null {
  const wordRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
  let match;
  while ((match = wordRegex.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (col >= start && col <= end) {
      return { word: match[0], start, end };
    }
  }
  return null;
}

documents.listen(connection);
connection.listen();
