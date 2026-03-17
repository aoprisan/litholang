// All token types in LithoLang

export enum TokenKind {
  // Literals
  NumberLiteral = "NumberLiteral",
  TextLiteral = "TextLiteral",
  BooleanLiteral = "BooleanLiteral",

  // Identifiers & Annotations
  Identifier = "Identifier",
  Annotation = "Annotation", // @purpose, @invariant, etc.

  // Keywords
  Define = "define",
  Struct = "struct",
  Enum = "enum",
  Has = "has",
  Is = "is",
  As = "as",
  End = "end",
  If = "if",
  Then = "then",
  Else = "else",
  For = "for",
  In = "in",
  Do = "do",
  Match = "match",
  On = "on",
  Case = "case",
  Return = "return",
  Check = "check",
  Or = "or",
  With = "with",
  Where = "where",
  Each = "each",
  Async = "async",
  Await = "await",
  All = "all",
  Import = "import",
  From = "from",
  Self = "self",
  And = "and",
  Not = "not",
  Type = "type",
  Extern = "extern",
  Of = "of",
  By = "by",
  Repeat = "repeat",
  While = "while",

  // Operators
  Pipe = "|>",
  Arrow = "->",
  FatArrow = "=>",
  QuestionMark = "?",
  Dot = ".",
  Comma = ",",
  Colon = ":",
  Equals = "=",
  DoubleEquals = "==",
  NotEquals = "!=",
  LessThan = "<",
  GreaterThan = ">",
  LessOrEqual = "<=",
  GreaterOrEqual = ">=",
  Plus = "+",
  Minus = "-",
  Star = "*",
  Slash = "/",
  Percent = "%",
  DotDot = "..",
  Bar = "|",

  // Delimiters
  LeftParen = "(",
  RightParen = ")",
  LeftBracket = "[",
  RightBracket = "]",

  // Special
  Newline = "Newline",
  EOF = "EOF",
}

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
}

export const KEYWORDS: Record<string, TokenKind> = {
  define: TokenKind.Define,
  struct: TokenKind.Struct,
  enum: TokenKind.Enum,
  has: TokenKind.Has,
  is: TokenKind.Is,
  as: TokenKind.As,
  end: TokenKind.End,
  if: TokenKind.If,
  then: TokenKind.Then,
  else: TokenKind.Else,
  for: TokenKind.For,
  in: TokenKind.In,
  do: TokenKind.Do,
  match: TokenKind.Match,
  on: TokenKind.On,
  case: TokenKind.Case,
  return: TokenKind.Return,
  check: TokenKind.Check,
  or: TokenKind.Or,
  with: TokenKind.With,
  where: TokenKind.Where,
  each: TokenKind.Each,
  async: TokenKind.Async,
  await: TokenKind.Await,
  all: TokenKind.All,
  import: TokenKind.Import,
  from: TokenKind.From,
  self: TokenKind.Self,
  and: TokenKind.And,
  not: TokenKind.Not,
  type: TokenKind.Type,
  extern: TokenKind.Extern,
  of: TokenKind.Of,
  by: TokenKind.By,
  repeat: TokenKind.Repeat,
  while: TokenKind.While,
  true: TokenKind.BooleanLiteral,
  false: TokenKind.BooleanLiteral,
};
