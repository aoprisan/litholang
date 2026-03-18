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
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { TypeChecker, LithoType } from "../../src/typechecker/typechecker.js";
import type { TypeError } from "../../src/typechecker/typechecker.js";

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Cache the latest type info per document for hover
const typeInfoCache = new Map<
  string,
  { checker: TypeChecker; source: string }
>();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      hoverProvider: true,
      completionProvider: {
        triggerCharacters: [".", "|", "@"],
      },
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

  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const checker = new TypeChecker();
    const typeErrors = checker.check(ast);

    // Cache for hover
    typeInfoCache.set(document.uri, { checker, source });

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

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
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
