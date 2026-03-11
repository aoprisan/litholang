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
export type { TypeError, ClarityType } from "./typechecker/typechecker.js";

export { TypeScriptEmitter } from "./emitter/typescript.js";
