export { TokenKind, KEYWORDS } from "./lexer/tokens.js";
export type { Token } from "./lexer/tokens.js";
export { Lexer } from "./lexer/lexer.js";
export { Parser } from "./parser/parser.js";

export type {
  Program,
  Declaration,
  Statement,
  Expression,
  TypeNode,
  Pattern,
  FunctionDef,
  StructDef,
  EnumDef,
  ExternDef,
  Annotation,
} from "./parser/ast.js";

export {
  checkTailRecursion,
  transformTailRecToLoop,
} from "./typechecker/tailrec.js";
export type { TailRecError, TailRecResult } from "./typechecker/tailrec.js";

export {
  findTrampolineGroups,
  validateTrampolineGroup,
  transformTrampolineGroup,
} from "./typechecker/trampoline.js";
export type {
  TrampolineGroup,
  TrampolineError,
} from "./typechecker/trampoline.js";

export { TypeChecker } from "./typechecker/typechecker.js";
export type { TypeError, LithoType } from "./typechecker/typechecker.js";

export { TypeScriptEmitter } from "./emitter/typescript.js";

export { Formatter } from "./formatter/formatter.js";
export { formatDiagnostic, formatDiagnostics } from "./diagnostics.js";
export type { Diagnostic } from "./diagnostics.js";
export { PRELUDE_FUNCTIONS, PRELUDE_CODE } from "./runtime/prelude.js";
export { COLLECTION_FUNCTIONS, COLLECTIONS_CODE } from "./runtime/collections.js";
