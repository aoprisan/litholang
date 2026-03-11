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
    while (this.pos < this.source.length) {
      this.skipSpaces();

      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      // Line comments
      if (ch === "-" && this.peek(1) === "-") {
        this.skipLineComment();
        continue;
      }

      // Newlines
      if (ch === "\n") {
        this.addToken(TokenKind.Newline, "\\n");
        this.advance();
        this.line++;
        this.column = 1;
        continue;
      }

      if (ch === "\r") {
        this.advance();
        if (this.pos < this.source.length && this.source[this.pos] === "\n") {
          this.advance();
        }
        this.addToken(TokenKind.Newline, "\\n");
        this.line++;
        this.column = 1;
        continue;
      }

      // Annotations: @word
      if (ch === "@") {
        this.readAnnotation();
        continue;
      }

      // Text literals
      if (ch === '"') {
        this.readTextLiteral();
        continue;
      }

      // Numbers
      if (this.isDigit(ch)) {
        this.readNumber();
        continue;
      }

      // Identifiers / keywords
      if (this.isIdentStart(ch)) {
        this.readIdentifier();
        continue;
      }

      // Multi-character operators
      if (ch === "|" && this.peek(1) === ">") {
        this.addToken(TokenKind.Pipe, "|>");
        this.advance();
        this.advance();
        continue;
      }

      if (ch === "-" && this.peek(1) === ">") {
        this.addToken(TokenKind.Arrow, "->");
        this.advance();
        this.advance();
        continue;
      }

      if (ch === "=" && this.peek(1) === ">") {
        this.addToken(TokenKind.FatArrow, "=>");
        this.advance();
        this.advance();
        continue;
      }

      if (ch === "=" && this.peek(1) === "=") {
        this.addToken(TokenKind.DoubleEquals, "==");
        this.advance();
        this.advance();
        continue;
      }

      if (ch === "!" && this.peek(1) === "=") {
        this.addToken(TokenKind.NotEquals, "!=");
        this.advance();
        this.advance();
        continue;
      }

      if (ch === "<" && this.peek(1) === "=") {
        this.addToken(TokenKind.LessOrEqual, "<=");
        this.advance();
        this.advance();
        continue;
      }

      if (ch === ">" && this.peek(1) === "=") {
        this.addToken(TokenKind.GreaterOrEqual, ">=");
        this.advance();
        this.advance();
        continue;
      }

      // Single-character tokens
      const singleCharTokens: Record<string, TokenKind> = {
        "(": TokenKind.LeftParen,
        ")": TokenKind.RightParen,
        "[": TokenKind.LeftBracket,
        "]": TokenKind.RightBracket,
        ".": TokenKind.Dot,
        ",": TokenKind.Comma,
        ":": TokenKind.Colon,
        "=": TokenKind.Equals,
        "?": TokenKind.QuestionMark,
        "+": TokenKind.Plus,
        "-": TokenKind.Minus,
        "*": TokenKind.Star,
        "/": TokenKind.Slash,
        "%": TokenKind.Percent,
        "<": TokenKind.LessThan,
        ">": TokenKind.GreaterThan,
      };

      const tokenKind = singleCharTokens[ch];
      if (tokenKind) {
        this.addToken(tokenKind, ch);
        this.advance();
        continue;
      }

      throw new Error(
        `Unexpected character '${ch}' at ${this.line}:${this.column}`
      );
    }

    this.addToken(TokenKind.EOF, "");
    return this.tokens;
  }

  private skipSpaces(): void {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === " " || ch === "\t") {
        this.advance();
      } else {
        break;
      }
    }
  }

  private skipLineComment(): void {
    while (this.pos < this.source.length && this.source[this.pos] !== "\n") {
      this.advance();
    }
  }

  private readAnnotation(): void {
    this.advance(); // skip @
    const start = this.pos;
    while (this.pos < this.source.length && this.isIdentChar(this.source[this.pos])) {
      this.advance();
    }
    const name = this.source.slice(start, this.pos);
    this.addToken(TokenKind.Annotation, name);
  }

  private readTextLiteral(): void {
    this.advance(); // skip opening "
    let value = "";
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === "\\") {
        this.advance();
        if (this.pos < this.source.length) {
          const escaped = this.source[this.pos];
          switch (escaped) {
            case "n": value += "\n"; break;
            case "t": value += "\t"; break;
            case "\\": value += "\\"; break;
            case '"': value += '"'; break;
            default: value += escaped;
          }
          this.advance();
        }
      } else {
        value += this.source[this.pos];
        this.advance();
      }
    }
    if (this.pos < this.source.length) {
      this.advance(); // skip closing "
    }
    this.addToken(TokenKind.TextLiteral, value);
  }

  private readNumber(): void {
    const start = this.pos;
    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      this.advance();
    }
    // Decimal point
    if (
      this.pos < this.source.length &&
      this.source[this.pos] === "." &&
      this.pos + 1 < this.source.length &&
      this.isDigit(this.source[this.pos + 1])
    ) {
      this.advance(); // skip .
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        this.advance();
      }
    }
    this.addToken(TokenKind.NumberLiteral, this.source.slice(start, this.pos));
  }

  private readIdentifier(): void {
    const start = this.pos;
    while (this.pos < this.source.length && this.isIdentChar(this.source[this.pos])) {
      this.advance();
    }
    const word = this.source.slice(start, this.pos);
    const keywordKind = KEYWORDS[word];
    if (keywordKind) {
      this.addToken(keywordKind, word);
    } else {
      this.addToken(TokenKind.Identifier, word);
    }
  }

  private addToken(kind: TokenKind, value: string): void {
    this.tokens.push({ kind, value, line: this.line, column: this.column });
  }

  private advance(): void {
    this.pos++;
    this.column++;
  }

  private peek(offset: number): string | undefined {
    return this.source[this.pos + offset];
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private isIdentStart(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
  }

  private isIdentChar(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }
}
