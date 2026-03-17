import { Token, TokenKind } from "../lexer/tokens.js";
import {
  Program,
  Declaration,
  FunctionDef,
  StructDef,
  EnumDef,
  TypeAlias,
  ImportDecl,
  ExternDef,
  Statement,
  Expression,
  TypeNode,
  Pattern,
  Parameter,
  FieldDef,
  Annotation,
  Argument,
  Position,
} from "./ast.js";

/**
 * Recursive descent parser for LithoLang.
 *
 * Consumes tokens from the Lexer and produces a Program AST.
 * The grammar is context-free with no ambiguities:
 * - `define...as...end` for functions
 * - `struct...has...end` for structs
 * - `enum...is...end` for enums
 * - `if...then...end`, `for...in...do...end`, `match...on...end`
 * - No operator precedence table needed beyond standard math rules
 */
export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Program {
    const declarations: Declaration[] = [];
    this.skipNewlines();

    while (!this.isAtEnd()) {
      declarations.push(this.parseDeclaration());
      this.skipNewlines();
    }

    return { kind: "Program", declarations };
  }

  // ─── Declarations ───

  private parseDeclaration(): Declaration {
    const annotations = this.parseAnnotations();

    const token = this.current();
    switch (token.kind) {
      case TokenKind.Define:
      case TokenKind.Async:
        return this.parseFunctionDef(annotations);
      case TokenKind.Struct:
        return this.parseStructDef(annotations);
      case TokenKind.Enum:
        return this.parseEnumDef(annotations);
      case TokenKind.Type:
        return this.parseTypeAlias();
      case TokenKind.Import:
        return this.parseImportDecl();
      case TokenKind.Extern:
        return this.parseExternDef(annotations);
      default:
        throw this.error(`Expected declaration, got '${token.value}'`);
    }
  }

  private parseAnnotations(): Annotation[] {
    const annotations: Annotation[] = [];
    while (this.check(TokenKind.Annotation)) {
      const token = this.consume(TokenKind.Annotation, "annotation");
      let value = "";
      if (this.check(TokenKind.TextLiteral)) {
        value = this.advance().value;
      }
      annotations.push({
        name: token.value,
        value,
        position: { line: token.line, column: token.column },
      });
      this.skipNewlines();
    }
    return annotations;
  }

  private parseFunctionDef(annotations: Annotation[]): FunctionDef {
    let isAsync = false;
    if (this.check(TokenKind.Async)) {
      isAsync = true;
      this.advance();
    }

    const defToken = this.consume(TokenKind.Define, "'define'");
    const name = this.consume(TokenKind.Identifier, "function name").value;

    this.consume(TokenKind.LeftParen, "'('");
    const params = this.parseParameterList();
    this.consume(TokenKind.RightParen, "')'");

    let returnType: TypeNode | null = null;
    if (this.check(TokenKind.Arrow)) {
      this.advance();
      returnType = this.parseType();
    }

    this.consume(TokenKind.As, "'as'");
    this.skipNewlines();

    const body = this.parseStatementBlock();

    this.consume(TokenKind.End, "'end'");

    return {
      kind: "FunctionDef",
      name,
      params,
      returnType,
      body,
      annotations,
      isAsync,
      position: { line: defToken.line, column: defToken.column },
    };
  }

  private parseParameterList(): Parameter[] {
    const params: Parameter[] = [];
    if (this.check(TokenKind.RightParen)) return params;

    params.push(this.parseParameter());
    while (this.check(TokenKind.Comma)) {
      this.advance();
      params.push(this.parseParameter());
    }
    return params;
  }

  private parseParameter(): Parameter {
    const name = this.consume(TokenKind.Identifier, "parameter name").value;
    this.consume(TokenKind.Colon, "':'");
    const type = this.parseType();
    let defaultValue: Expression | undefined;
    if (this.check(TokenKind.Equals)) {
      this.advance();
      defaultValue = this.parseExpression();
    }
    return { name, type, defaultValue };
  }

  private parseStructDef(annotations: Annotation[]): StructDef {
    const structToken = this.consume(TokenKind.Struct, "'struct'");
    const name = this.consume(TokenKind.Identifier, "struct name").value;
    this.consume(TokenKind.Has, "'has'");
    this.skipNewlines();

    const fields: FieldDef[] = [];
    const methods: FunctionDef[] = [];

    while (!this.check(TokenKind.End)) {
      this.skipNewlines();
      if (this.check(TokenKind.End)) break;

      if (this.check(TokenKind.Define) || this.check(TokenKind.Async)) {
        const methodAnnotations = this.parseAnnotations();
        methods.push(this.parseFunctionDef(methodAnnotations));
      } else if (this.check(TokenKind.Annotation)) {
        // Annotations before a method
        const methodAnnotations = this.parseAnnotations();
        if (this.check(TokenKind.Define) || this.check(TokenKind.Async)) {
          methods.push(this.parseFunctionDef(methodAnnotations));
        }
      } else {
        fields.push(this.parseFieldDef());
      }
      this.skipNewlines();
    }

    this.consume(TokenKind.End, "'end'");

    return {
      kind: "StructDef",
      name,
      fields,
      methods,
      annotations,
      position: { line: structToken.line, column: structToken.column },
    };
  }

  private parseFieldDef(): FieldDef {
    const name = this.consume(TokenKind.Identifier, "field name").value;
    this.consume(TokenKind.Colon, "':'");
    const type = this.parseType();
    let defaultValue: Expression | undefined;
    if (this.check(TokenKind.Equals)) {
      this.advance();
      defaultValue = this.parseExpression();
    }
    return { name, type, defaultValue };
  }

  private parseEnumDef(annotations: Annotation[]): EnumDef {
    const enumToken = this.consume(TokenKind.Enum, "'enum'");
    const name = this.consume(TokenKind.Identifier, "enum name").value;
    this.consume(TokenKind.Is, "'is'");
    this.skipNewlines();

    const variants: string[] = [];
    while (!this.check(TokenKind.End)) {
      this.skipNewlines();
      if (this.check(TokenKind.End)) break;
      variants.push(this.consume(TokenKind.Identifier, "variant name").value);
      this.skipNewlines();
    }

    this.consume(TokenKind.End, "'end'");

    return {
      kind: "EnumDef",
      name,
      variants,
      annotations,
      position: { line: enumToken.line, column: enumToken.column },
    };
  }

  private parseTypeAlias(): TypeAlias {
    const typeToken = this.consume(TokenKind.Type, "'type'");
    const name = this.consume(TokenKind.Identifier, "type name").value;
    this.consume(TokenKind.Equals, "'='");
    const type = this.parseType();
    return {
      kind: "TypeAlias",
      name,
      type,
      position: { line: typeToken.line, column: typeToken.column },
    };
  }

  private parseImportDecl(): ImportDecl {
    const importToken = this.consume(TokenKind.Import, "'import'");
    const names: string[] = [];
    names.push(this.consume(TokenKind.Identifier, "import name").value);
    while (this.check(TokenKind.Comma)) {
      this.advance();
      names.push(this.consume(TokenKind.Identifier, "import name").value);
    }
    this.consume(TokenKind.From, "'from'");
    const source = this.consume(TokenKind.TextLiteral, "module path").value;
    return {
      kind: "ImportDecl",
      names,
      source,
      position: { line: importToken.line, column: importToken.column },
    };
  }

  private parseExternDef(annotations: Annotation[]): ExternDef {
    const externToken = this.consume(TokenKind.Extern, "'extern'");

    let isAsync = false;
    if (this.check(TokenKind.Async)) {
      isAsync = true;
      this.advance();
    }

    this.consume(TokenKind.Define, "'define'");
    const name = this.consume(TokenKind.Identifier, "function name").value;

    this.consume(TokenKind.LeftParen, "'('");
    const params = this.parseParameterList();
    this.consume(TokenKind.RightParen, "')'");

    let returnType: TypeNode | null = null;
    if (this.check(TokenKind.Arrow)) {
      this.advance();
      returnType = this.parseType();
    }

    this.skipNewlines();
    this.consume(TokenKind.From, "'from'");
    const source = this.consume(TokenKind.TextLiteral, "module path").value;
    this.skipNewlines();

    this.consume(TokenKind.End, "'end'");

    return {
      kind: "ExternDef",
      name,
      params,
      returnType,
      source,
      isAsync,
      annotations,
      position: { line: externToken.line, column: externToken.column },
    };
  }

  // ─── Types ───

  private parseType(): TypeNode {
    const pos = this.position();

    // Function type: (Type, Type) -> ReturnType
    if (this.check(TokenKind.LeftParen)) {
      const saved = this.pos;
      try {
        return this.parseFunctionType();
      } catch {
        this.pos = saved;
      }
    }

    const name = this.consume(TokenKind.Identifier, "type name").value;

    // Generic type: Name<T, U>
    if (this.check(TokenKind.LessThan)) {
      this.advance();
      const typeArgs: TypeNode[] = [];
      typeArgs.push(this.parseType());
      while (this.check(TokenKind.Comma)) {
        this.advance();
        typeArgs.push(this.parseType());
      }
      this.consume(TokenKind.GreaterThan, "'>'");
      return { kind: "GenericType", name, typeArgs, position: pos };
    }

    return { kind: "SimpleType", name, position: pos };
  }

  private parseFunctionType(): TypeNode {
    const pos = this.position();
    this.consume(TokenKind.LeftParen, "'('");
    const params: TypeNode[] = [];
    if (!this.check(TokenKind.RightParen)) {
      params.push(this.parseType());
      while (this.check(TokenKind.Comma)) {
        this.advance();
        params.push(this.parseType());
      }
    }
    this.consume(TokenKind.RightParen, "')'");
    this.consume(TokenKind.Arrow, "'->'");
    const returnType = this.parseType();
    return { kind: "FunctionType", params, returnType, position: pos };
  }

  // ─── Statements ───

  private parseStatementBlock(): Statement[] {
    const statements: Statement[] = [];
    this.skipNewlines();

    while (
      !this.check(TokenKind.End) &&
      !this.check(TokenKind.Else) &&
      !this.check(TokenKind.Case) &&
      !this.check(TokenKind.EOF)
    ) {
      statements.push(this.parseStatement());
      this.skipNewlines();
    }

    return statements;
  }

  private parseStatement(): Statement {
    const token = this.current();

    switch (token.kind) {
      case TokenKind.Return:
        return this.parseReturnStatement();
      case TokenKind.If:
        return this.parseIfStatement();
      case TokenKind.For:
        return this.parseForStatement();
      case TokenKind.Match:
        return this.parseMatchStatement();
      case TokenKind.Check:
        return this.parseCheckStatement();
      default: {
        // Assignment or expression statement
        // Look ahead: identifier followed by = (but not ==)
        if (
          token.kind === TokenKind.Identifier &&
          this.peekToken(1)?.kind === TokenKind.Equals
        ) {
          return this.parseAssignment();
        }
        return this.parseExpressionStatement();
      }
    }
  }

  private parseReturnStatement(): Statement {
    const returnToken = this.consume(TokenKind.Return, "'return'");
    // Check if there's an expression following on the same line
    if (
      this.check(TokenKind.Newline) ||
      this.check(TokenKind.End) ||
      this.check(TokenKind.EOF)
    ) {
      return {
        kind: "ReturnStatement",
        value: {
          kind: "IdentifierExpr",
          name: "undefined",
          position: this.position(),
        },
        position: { line: returnToken.line, column: returnToken.column },
      };
    }
    const value = this.parseExpression();
    return {
      kind: "ReturnStatement",
      value,
      position: { line: returnToken.line, column: returnToken.column },
    };
  }

  private parseIfStatement(): Statement {
    const ifToken = this.consume(TokenKind.If, "'if'");
    const condition = this.parseExpression();
    this.consume(TokenKind.Then, "'then'");
    this.skipNewlines();

    const thenBlock = this.parseStatementBlock();
    const elseIfClauses: { condition: Expression; block: Statement[] }[] = [];
    let elseBlock: Statement[] | null = null;

    while (this.check(TokenKind.Else)) {
      this.advance();
      if (this.check(TokenKind.If)) {
        this.advance();
        const elseIfCondition = this.parseExpression();
        this.consume(TokenKind.Then, "'then'");
        this.skipNewlines();
        const elseIfBlock = this.parseStatementBlock();
        elseIfClauses.push({ condition: elseIfCondition, block: elseIfBlock });
      } else {
        this.skipNewlines();
        elseBlock = this.parseStatementBlock();
        break;
      }
    }

    this.consume(TokenKind.End, "'end'");

    return {
      kind: "IfStatement",
      condition,
      thenBlock,
      elseIfClauses,
      elseBlock,
      position: { line: ifToken.line, column: ifToken.column },
    };
  }

  private parseForStatement(): Statement {
    const forToken = this.consume(TokenKind.For, "'for'");
    const variable = this.consume(TokenKind.Identifier, "loop variable").value;
    this.consume(TokenKind.In, "'in'");
    const iterable = this.parseExpression();
    this.consume(TokenKind.Do, "'do'");
    this.skipNewlines();

    const body = this.parseStatementBlock();
    this.consume(TokenKind.End, "'end'");

    return {
      kind: "ForStatement",
      variable,
      iterable,
      body,
      position: { line: forToken.line, column: forToken.column },
    };
  }

  private parseMatchStatement(): Statement {
    const matchToken = this.consume(TokenKind.Match, "'match'");
    const subject = this.parseExpression();
    this.consume(TokenKind.On, "'on'");
    this.skipNewlines();

    const cases: { pattern: Pattern; body: Expression | Statement[] }[] = [];
    while (this.check(TokenKind.Case)) {
      this.advance();
      const pattern = this.parsePattern();
      this.consume(TokenKind.FatArrow, "'=>'");
      this.skipNewlines();

      // Check if body is a single expression or a statement block
      if (
        this.check(TokenKind.Return) ||
        this.check(TokenKind.If) ||
        this.check(TokenKind.For) ||
        this.check(TokenKind.Match) ||
        this.check(TokenKind.Check)
      ) {
        const stmts: Statement[] = [];
        stmts.push(this.parseStatement());
        this.skipNewlines();
        // Collect more statements until next case or end
        while (
          !this.check(TokenKind.Case) &&
          !this.check(TokenKind.End) &&
          !this.check(TokenKind.EOF)
        ) {
          stmts.push(this.parseStatement());
          this.skipNewlines();
        }
        cases.push({ pattern, body: stmts });
      } else {
        // Could be expression or assignment
        if (
          this.current().kind === TokenKind.Identifier &&
          this.peekToken(1)?.kind === TokenKind.Equals
        ) {
          const stmts: Statement[] = [];
          stmts.push(this.parseAssignment());
          this.skipNewlines();
          while (
            !this.check(TokenKind.Case) &&
            !this.check(TokenKind.End) &&
            !this.check(TokenKind.EOF)
          ) {
            stmts.push(this.parseStatement());
            this.skipNewlines();
          }
          cases.push({ pattern, body: stmts });
        } else {
          const expr = this.parseExpression();
          this.skipNewlines();
          cases.push({ pattern, body: expr });
        }
      }
    }

    this.consume(TokenKind.End, "'end'");

    return {
      kind: "MatchStatement",
      subject,
      cases,
      position: { line: matchToken.line, column: matchToken.column },
    };
  }

  private parseCheckStatement(): Statement {
    const checkToken = this.consume(TokenKind.Check, "'check'");
    // Parse condition up to 'or' — use parseAnd to avoid consuming 'or' as boolean operator
    const condition = this.parseAnd();
    this.consume(TokenKind.Or, "'or'");
    this.consume(TokenKind.Return, "'return'");
    const fallback = this.parseExpression();

    return {
      kind: "CheckStatement",
      condition,
      fallback,
      position: { line: checkToken.line, column: checkToken.column },
    };
  }

  private parseAssignment(): Statement {
    const token = this.current();
    const target = this.consume(TokenKind.Identifier, "variable name").value;
    this.consume(TokenKind.Equals, "'='");
    const value = this.parseExpression();
    return {
      kind: "Assignment",
      target,
      value,
      position: { line: token.line, column: token.column },
    };
  }

  private parseExpressionStatement(): Statement {
    const pos = this.position();
    const expr = this.parseExpression();
    return { kind: "ExpressionStatement", expr, position: pos };
  }

  // ─── Patterns ───

  private parsePattern(): Pattern {
    const token = this.current();

    // Wildcard
    if (token.kind === TokenKind.Identifier && token.value === "_") {
      this.advance();
      return { kind: "WildcardPattern" };
    }

    // Tuple pattern: (p1, p2)
    if (token.kind === TokenKind.LeftParen) {
      this.advance();
      const elements: Pattern[] = [];
      elements.push(this.parsePattern());
      while (this.check(TokenKind.Comma)) {
        this.advance();
        elements.push(this.parsePattern());
      }
      this.consume(TokenKind.RightParen, "')'");
      return { kind: "TuplePattern", elements };
    }

    // Literal patterns
    if (token.kind === TokenKind.NumberLiteral) {
      this.advance();
      return { kind: "LiteralPattern", value: Number(token.value) };
    }
    if (token.kind === TokenKind.TextLiteral) {
      this.advance();
      return { kind: "LiteralPattern", value: token.value };
    }
    if (token.kind === TokenKind.BooleanLiteral) {
      this.advance();
      return { kind: "LiteralPattern", value: token.value === "true" };
    }

    // Constructor pattern: Name(inner) or just identifier
    if (token.kind === TokenKind.Identifier) {
      this.advance();
      if (this.check(TokenKind.LeftParen)) {
        this.advance();
        let inner: Pattern | null = null;
        if (!this.check(TokenKind.RightParen)) {
          inner = this.parsePattern();
        }
        this.consume(TokenKind.RightParen, "')'");
        return { kind: "ConstructorPattern", name: token.value, inner };
      }
      return { kind: "IdentifierPattern", name: token.value };
    }

    throw this.error(`Expected pattern, got '${token.value}'`);
  }

  // ─── Expressions ───

  private parseExpression(): Expression {
    let expr = this.parseOr();

    // Pipeline: expr |> step |> step
    while (this.check(TokenKind.Pipe)) {
      this.advance();
      const steps: { callee: Expression; args: Argument[] }[] = [];

      const stepExpr = this.parsePipelineStep();
      steps.push(stepExpr);

      while (this.check(TokenKind.Pipe)) {
        this.advance();
        steps.push(this.parsePipelineStep());
      }

      expr = {
        kind: "PipelineExpr",
        source: expr,
        steps,
        position: this.positionOf(expr),
      };
    }

    // With expression: expr with field: value
    if (this.check(TokenKind.With)) {
      this.advance();
      const updates: { field: string; value: Expression }[] = [];
      do {
        const field = this.consume(TokenKind.Identifier, "field name").value;
        this.consume(TokenKind.Colon, "':'");
        const value = this.parseOr();
        updates.push({ field, value });
        if (!this.check(TokenKind.Comma)) break;
        this.advance();
      } while (true);

      expr = {
        kind: "WithExpr",
        base: expr,
        updates,
        position: this.positionOf(expr),
      };
    }

    // Propagation: expr?
    if (this.check(TokenKind.QuestionMark)) {
      this.advance();
      expr = {
        kind: "PropagateExpr",
        expr,
        position: this.positionOf(expr),
      };
    }

    return expr;
  }

  private parsePipelineStep(): { callee: Expression; args: Argument[] } {
    const callee = this.parsePrimary();
    const args: Argument[] = [];
    if (this.check(TokenKind.LeftParen)) {
      this.advance();
      if (!this.check(TokenKind.RightParen)) {
        args.push(...this.parseArgumentList());
      }
      this.consume(TokenKind.RightParen, "')'");
    }
    return { callee, args };
  }

  private parseOr(): Expression {
    let left = this.parseAnd();
    while (this.check(TokenKind.Or)) {
      this.advance();
      const right = this.parseAnd();
      left = {
        kind: "BinaryExpr",
        operator: "or",
        left,
        right,
        position: this.positionOf(left),
      };
    }
    return left;
  }

  private parseAnd(): Expression {
    let left = this.parseEquality();
    while (this.check(TokenKind.And)) {
      this.advance();
      const right = this.parseEquality();
      left = {
        kind: "BinaryExpr",
        operator: "and",
        left,
        right,
        position: this.positionOf(left),
      };
    }
    return left;
  }

  private parseEquality(): Expression {
    let left = this.parseComparison();
    while (
      this.check(TokenKind.DoubleEquals) ||
      this.check(TokenKind.NotEquals)
    ) {
      const op = this.advance().value;
      const right = this.parseComparison();
      left = {
        kind: "BinaryExpr",
        operator: op,
        left,
        right,
        position: this.positionOf(left),
      };
    }
    return left;
  }

  private parseComparison(): Expression {
    let left = this.parseAddition();
    while (
      this.check(TokenKind.LessThan) ||
      this.check(TokenKind.GreaterThan) ||
      this.check(TokenKind.LessOrEqual) ||
      this.check(TokenKind.GreaterOrEqual)
    ) {
      const op = this.advance().value;
      const right = this.parseAddition();
      left = {
        kind: "BinaryExpr",
        operator: op,
        left,
        right,
        position: this.positionOf(left),
      };
    }
    return left;
  }

  private parseAddition(): Expression {
    let left = this.parseMultiplication();
    while (this.check(TokenKind.Plus) || this.check(TokenKind.Minus)) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = {
        kind: "BinaryExpr",
        operator: op,
        left,
        right,
        position: this.positionOf(left),
      };
    }
    return left;
  }

  private parseMultiplication(): Expression {
    let left = this.parseUnary();
    while (
      this.check(TokenKind.Star) ||
      this.check(TokenKind.Slash) ||
      this.check(TokenKind.Percent)
    ) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = {
        kind: "BinaryExpr",
        operator: op,
        left,
        right,
        position: this.positionOf(left),
      };
    }
    return left;
  }

  private parseUnary(): Expression {
    if (this.check(TokenKind.Await)) {
      const token = this.advance();
      const expr = this.parseUnary();
      return {
        kind: "AwaitExpr",
        expr,
        position: { line: token.line, column: token.column },
      };
    }
    if (this.check(TokenKind.Not)) {
      const token = this.advance();
      const operand = this.parseUnary();
      return {
        kind: "UnaryExpr",
        operator: "not",
        operand,
        position: { line: token.line, column: token.column },
      };
    }
    if (this.check(TokenKind.Minus)) {
      const token = this.advance();
      const operand = this.parseUnary();
      return {
        kind: "UnaryExpr",
        operator: "-",
        operand,
        position: { line: token.line, column: token.column },
      };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expression {
    let expr = this.parsePrimary();

    while (true) {
      if (this.check(TokenKind.Dot)) {
        this.advance();
        const field = this.consume(TokenKind.Identifier, "field name").value;
        expr = {
          kind: "DotAccess",
          object: expr,
          field,
          position: this.positionOf(expr),
        };
      } else if (this.check(TokenKind.LeftParen)) {
        this.advance();
        const args: Argument[] = [];
        if (!this.check(TokenKind.RightParen)) {
          args.push(...this.parseArgumentList());
        }
        this.consume(TokenKind.RightParen, "')'");
        expr = {
          kind: "CallExpr",
          callee: expr,
          args,
          position: this.positionOf(expr),
        };
      } else if (this.check(TokenKind.LeftBracket)) {
        this.advance();
        const index = this.parseExpression();
        this.consume(TokenKind.RightBracket, "']'");
        expr = {
          kind: "CallExpr",
          callee: {
            kind: "DotAccess",
            object: expr,
            field: "at",
            position: this.positionOf(expr),
          },
          args: [{ value: index }],
          position: this.positionOf(expr),
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimary(): Expression {
    const token = this.current();

    // Number literal
    if (token.kind === TokenKind.NumberLiteral) {
      this.advance();
      return {
        kind: "NumberLiteral",
        value: Number(token.value),
        position: { line: token.line, column: token.column },
      };
    }

    // Text literal
    if (token.kind === TokenKind.TextLiteral) {
      this.advance();
      return {
        kind: "TextLiteral",
        value: token.value,
        segments: [{ text: token.value }],
        position: { line: token.line, column: token.column },
      };
    }

    // Boolean literal
    if (token.kind === TokenKind.BooleanLiteral) {
      this.advance();
      return {
        kind: "BooleanLiteral",
        value: token.value === "true",
        position: { line: token.line, column: token.column },
      };
    }

    // Self
    if (token.kind === TokenKind.Self) {
      this.advance();
      return {
        kind: "SelfExpr",
        position: { line: token.line, column: token.column },
      };
    }

    // Short dot access: .field
    if (token.kind === TokenKind.Dot) {
      this.advance();
      const field = this.consume(TokenKind.Identifier, "field name").value;
      return {
        kind: "ShortDotAccess",
        field,
        position: { line: token.line, column: token.column },
      };
    }

    // List literal: [elem1, elem2]
    if (token.kind === TokenKind.LeftBracket) {
      this.advance();
      const elements: Expression[] = [];
      if (!this.check(TokenKind.RightBracket)) {
        elements.push(this.parseExpression());
        while (this.check(TokenKind.Comma)) {
          this.advance();
          elements.push(this.parseExpression());
        }
      }
      this.consume(TokenKind.RightBracket, "']'");
      return {
        kind: "ListLiteral",
        elements,
        position: { line: token.line, column: token.column },
      };
    }

    // Parenthesized expression
    if (token.kind === TokenKind.LeftParen) {
      this.advance();
      const expr = this.parseExpression();
      this.consume(TokenKind.RightParen, "')'");
      return expr;
    }

    // Lambda: each x => expr
    if (token.kind === TokenKind.Each) {
      this.advance();
      const params: Parameter[] = [];
      const paramName = this.consume(TokenKind.Identifier, "parameter name");
      params.push({
        name: paramName.value,
        type: { kind: "SimpleType", name: "Any", position: { line: paramName.line, column: paramName.column } },
      });
      this.consume(TokenKind.FatArrow, "'=>'");
      const body = this.parseExpression();
      return {
        kind: "LambdaExpr",
        params,
        body,
        position: { line: token.line, column: token.column },
      };
    }

    // Identifier (possibly a constructor call with named args: Name(field: value))
    if (token.kind === TokenKind.Identifier) {
      this.advance();

      // Check for constructor call: Capitalized name followed by (
      if (
        token.value[0] === token.value[0].toUpperCase() &&
        token.value[0] !== token.value[0].toLowerCase() &&
        this.check(TokenKind.LeftParen)
      ) {
        // Could be a constructor or regular call — check for named args
        const saved = this.pos;
        this.advance(); // skip (
        if (
          this.check(TokenKind.Identifier) &&
          this.peekToken(1)?.kind === TokenKind.Colon
        ) {
          // Constructor with named fields
          this.pos = saved;
          this.advance(); // skip (
          const fields: { name: string; value: Expression }[] = [];
          if (!this.check(TokenKind.RightParen)) {
            do {
              const fieldName = this.consume(TokenKind.Identifier, "field name").value;
              this.consume(TokenKind.Colon, "':'");
              const value = this.parseExpression();
              fields.push({ name: fieldName, value });
              if (!this.check(TokenKind.Comma)) break;
              this.advance();
            } while (true);
          }
          this.consume(TokenKind.RightParen, "')'");
          return {
            kind: "ConstructExpr",
            typeName: token.value,
            fields,
            position: { line: token.line, column: token.column },
          };
        }
        this.pos = saved;
      }

      return {
        kind: "IdentifierExpr",
        name: token.value,
        position: { line: token.line, column: token.column },
      };
    }

    // all [expr1, expr2, ...] — concurrent await
    if (token.kind === TokenKind.All) {
      this.advance();
      this.consume(TokenKind.LeftBracket, "'['");
      const exprs: Expression[] = [];
      if (!this.check(TokenKind.RightBracket)) {
        exprs.push(this.parseExpression());
        while (this.check(TokenKind.Comma)) {
          this.advance();
          exprs.push(this.parseExpression());
        }
      }
      this.consume(TokenKind.RightBracket, "']'");
      return {
        kind: "AllExpr",
        exprs,
        position: { line: token.line, column: token.column },
      };
    }

    // Keywords that can appear as identifiers in some contexts
    if (token.kind === TokenKind.On) {
      this.advance();
      return {
        kind: "IdentifierExpr",
        name: token.value,
        position: { line: token.line, column: token.column },
      };
    }

    throw this.error(`Expected expression, got '${token.value}' (${token.kind})`);
  }

  private parseArgumentList(): Argument[] {
    const args: Argument[] = [];

    do {
      // Check for named argument: name: value
      if (
        this.check(TokenKind.Identifier) &&
        this.peekToken(1)?.kind === TokenKind.Colon
      ) {
        const name = this.advance().value;
        this.advance(); // skip :
        const value = this.parseExpression();
        args.push({ name, value });
      } else {
        const value = this.parseExpression();
        args.push({ value });
      }
      if (!this.check(TokenKind.Comma)) break;
      this.advance();
    } while (true);

    return args;
  }

  // ─── Helpers ───

  private current(): Token {
    return this.tokens[this.pos] ?? {
      kind: TokenKind.EOF,
      value: "",
      line: 0,
      column: 0,
    };
  }

  private peekToken(offset: number): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private check(kind: TokenKind): boolean {
    return this.current().kind === kind;
  }

  private consume(kind: TokenKind, expected: string): Token {
    if (this.check(kind)) return this.advance();
    const token = this.current();
    throw this.error(`Expected ${expected}, got '${token.value}' (${token.kind})`);
  }

  private isAtEnd(): boolean {
    return this.current().kind === TokenKind.EOF;
  }

  private skipNewlines(): void {
    while (this.check(TokenKind.Newline)) {
      this.advance();
    }
  }

  private position(): Position {
    const token = this.current();
    return { line: token.line, column: token.column };
  }

  private positionOf(expr: Expression): Position {
    return (expr as { position: Position }).position;
  }

  private error(message: string): Error {
    const token = this.current();
    return new Error(`Parse error at ${token.line}:${token.column}: ${message}`);
  }
}
