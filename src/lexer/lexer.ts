import { Token, TokenKind, KEYWORDS } from "./tokens.js";

/**
 * Lexer for ClarityLang source code.
 *
 * Tokenizes .clarity files into a stream of Token objects.
 * Key behaviors:
 * - `--` starts a line comment (ignored)
 * - `@word` produces an Annotation token
 * - `"text with {interpolation}"` produces TextLiteral tokens
 * - Multi-character operators: |>, ->, =>, ==, !=, <=, >=
 * - Keywords vs identifiers resolved via KEYWORDS lookup
 * - Newlines are significant tokens (statement separators)
 */
export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    // TODO: Implement tokenization
    // This is the first thing to build in Claude Code.
    throw new Error("Lexer not yet implemented");
  }
}
