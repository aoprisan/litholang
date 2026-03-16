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
} from "../parser/ast.js";
import {
  checkTailRecursion,
  transformTailRecToLoop,
} from "../typechecker/tailrec.js";
import {
  findTrampolineGroups,
  validateTrampolineGroup,
  transformTrampolineGroup,
} from "../typechecker/trampoline.js";

/**
 * Emits TypeScript code from a ClarityLang AST.
 *
 * Mapping rules:
 * - `define name(p: T) -> R as...end`  →  `function name(p: T): R { ... }`
 * - `struct Name has...end`            →  `interface Name { ... }`
 * - `enum Name is...end`               →  `enum Name { ... }`
 * - `|> func(args)`                    →  `func(prev, args)`
 * - `expr?`                            →  unwrap-or-return-error pattern
 * - `x with field: val`               →  `{ ...x, field: val }`
 * - `Result<T,E>`                      →  `{ ok: true, value: T } | { ok: false, error: E }`
 * - `Maybe<T>`                         →  `T | null`
 * - `check cond or return val`         →  `if (!cond) return val;`
 * - `match...on...end`                 →  switch or if-else chain
 *
 * Tail recursion:
 * - `@tailrec` functions               →  while(true) loop with param reassignment
 * - `@trampoline` function groups      →  thunk-returning functions + driver loop
 */
export class TypeScriptEmitter {
  private errors: string[] = [];
  private needsResultHelper = false;
  private needsMaybeHelper = false;

  emit(program: Program): string {
    this.errors = [];
    this.needsResultHelper = false;
    this.needsMaybeHelper = false;
    const chunks: string[] = [];

    // Handle @trampoline groups first — they rewrite declarations
    const trampolineGroups = findTrampolineGroups(program);
    const trampolineFuncNames = new Set<string>();

    for (const group of trampolineGroups) {
      const validationErrors = validateTrampolineGroup(group);
      if (validationErrors.length > 0) {
        for (const err of validationErrors) {
          this.errors.push(`${err.position.line}:${err.position.column}: ${err.message}`);
        }
        continue;
      }

      for (const func of group.functions) {
        trampolineFuncNames.add(func.name);
      }

      // Emit the Thunk type helper once
      chunks.push(
        `type Thunk<T> = { done: false; fn: () => Thunk<T> } | { done: true; value: T };`
      );
      chunks.push("");

      const { internalFunctions, wrapperFunctions } =
        transformTrampolineGroup(group);

      // Emit internal thunk-returning functions
      for (const func of internalFunctions) {
        chunks.push(this.emitTrampolineInternal(func));
        chunks.push("");
      }

      // Emit public wrapper functions with trampoline loop
      for (const func of wrapperFunctions) {
        chunks.push(this.emitTrampolineWrapper(func));
        chunks.push("");
      }
    }

    // Emit remaining declarations
    for (const decl of program.declarations) {
      if (decl.kind === "FunctionDef" && trampolineFuncNames.has(decl.name)) {
        continue; // Already handled by trampoline
      }

      switch (decl.kind) {
        case "FunctionDef":
          chunks.push(this.emitFunctionDef(decl));
          chunks.push("");
          break;
        case "StructDef":
          chunks.push(this.emitStructDef(decl));
          chunks.push("");
          break;
        case "EnumDef":
          chunks.push(this.emitEnumDef(decl));
          chunks.push("");
          break;
        case "TypeAlias":
          chunks.push(this.emitTypeAlias(decl));
          chunks.push("");
          break;
        case "ImportDecl":
          chunks.push(this.emitImportDecl(decl));
          chunks.push("");
          break;
        case "ExternDef":
          chunks.push(this.emitExternDef(decl));
          chunks.push("");
          break;
      }
    }

    if (this.errors.length > 0) {
      throw new Error(
        `Tail recursion errors:\n${this.errors.join("\n")}`
      );
    }

    // Prepend helper functions if needed
    const helpers: string[] = [];
    if (this.needsResultHelper) {
      helpers.push(
        `function __propagateResult<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {`,
        `  if (!result.ok) throw { __clarityPropagate: true, value: result };`,
        `  return result.value;`,
        `}`,
        "",
      );
    }
    if (this.needsMaybeHelper) {
      helpers.push(
        `function __propagateMaybe<T>(value: T | null): T {`,
        `  if (value === null) throw { __clarityPropagate: true, value: null };`,
        `  return value;`,
        `}`,
        "",
      );
    }

    const allChunks = [...helpers, ...chunks];
    return allChunks.join("\n").trimEnd() + "\n";
  }

  emitFunctionDef(func: FunctionDef): string {
    // Check @tailrec annotation
    const tailRecResult = checkTailRecursion(func);
    if (tailRecResult.errors.length > 0) {
      for (const err of tailRecResult.errors) {
        this.errors.push(`${err.position.line}:${err.position.column}: ${err.message}`);
      }
    }

    let targetFunc = func;
    if (tailRecResult.isTailRecursive) {
      targetFunc = transformTailRecToLoop(func);
    }

    return this.emitFunction(targetFunc, tailRecResult.isTailRecursive);
  }

  emitStructDef(struct: StructDef): string {
    const lines: string[] = [];
    lines.push(`interface ${struct.name} {`);
    for (const field of struct.fields) {
      lines.push(`  ${field.name}: ${this.emitType(field.type)};`);
    }
    lines.push("}");

    // Emit methods as standalone functions
    for (const method of struct.methods) {
      lines.push("");
      lines.push(this.emitFunctionDef(method));
    }

    return lines.join("\n");
  }

  emitEnumDef(enumDef: EnumDef): string {
    const lines: string[] = [];
    lines.push(`enum ${enumDef.name} {`);
    for (const variant of enumDef.variants) {
      lines.push(`  ${variant},`);
    }
    lines.push("}");
    return lines.join("\n");
  }

  emitTypeAlias(alias: TypeAlias): string {
    return `type ${alias.name} = ${this.emitType(alias.type)};`;
  }

  emitImportDecl(decl: ImportDecl): string {
    const names = decl.names.join(", ");
    return `import { ${names} } from "${decl.source}";`;
  }

  emitExternDef(decl: ExternDef): string {
    return `import { ${decl.name} } from "${decl.source}";`;
  }

  private emitFunction(func: FunctionDef, isTailRecOptimized: boolean): string {
    const params = func.params
      .map((p) => `${p.name}: ${this.emitType(p.type)}`)
      .join(", ");
    const returnType = func.returnType
      ? `: ${this.emitType(func.returnType)}`
      : "";
    const asyncPrefix = func.isAsync ? "async " : "";
    const usesPropagation = this.bodyUsesPropagation(func.body);

    const lines: string[] = [];
    lines.push(`${asyncPrefix}function ${func.name}(${params})${returnType} {`);

    const baseIndent = usesPropagation ? 4 : 2;

    if (usesPropagation) {
      lines.push("  try {");
    }

    if (isTailRecOptimized) {
      lines.push(`${" ".repeat(baseIndent)}while (true) {`);
      const loopBody =
        func.body.length === 1 && func.body[0].kind === "ForStatement"
          ? func.body[0].body
          : func.body;
      for (const stmt of loopBody) {
        lines.push(this.emitStatement(stmt, baseIndent + 2));
      }
      lines.push(`${" ".repeat(baseIndent)}}`);
    } else {
      for (const stmt of func.body) {
        lines.push(this.emitStatement(stmt, baseIndent));
      }
    }

    if (usesPropagation) {
      lines.push("  } catch (__e: unknown) {");
      lines.push("    if (__e && typeof __e === \"object\" && \"__clarityPropagate\" in __e) return (__e as { value: unknown }).value;");
      lines.push("    throw __e;");
      lines.push("  }");
    }

    lines.push("}");
    return lines.join("\n");
  }

  private bodyUsesPropagation(body: Statement[]): boolean {
    for (const stmt of body) {
      if (this.statementUsesPropagation(stmt)) return true;
    }
    return false;
  }

  private statementUsesPropagation(stmt: Statement): boolean {
    switch (stmt.kind) {
      case "ReturnStatement":
        return this.exprUsesPropagation(stmt.value);
      case "Assignment":
        return this.exprUsesPropagation(stmt.value);
      case "ExpressionStatement":
        return this.exprUsesPropagation(stmt.expr);
      case "IfStatement":
        return this.bodyUsesPropagation(stmt.thenBlock) ||
          stmt.elseIfClauses.some(c => this.bodyUsesPropagation(c.block)) ||
          (stmt.elseBlock !== null && this.bodyUsesPropagation(stmt.elseBlock));
      case "ForStatement":
        return this.bodyUsesPropagation(stmt.body);
      case "MatchStatement":
        return stmt.cases.some(c =>
          Array.isArray(c.body) ? this.bodyUsesPropagation(c.body) : this.exprUsesPropagation(c.body)
        );
      case "CheckStatement":
        return this.exprUsesPropagation(stmt.condition) ||
          this.exprUsesPropagation(stmt.fallback);
    }
  }

  private exprUsesPropagation(expr: Expression): boolean {
    switch (expr.kind) {
      case "PropagateExpr": return true;
      case "CallExpr":
        return this.exprUsesPropagation(expr.callee) ||
          expr.args.some(a => this.exprUsesPropagation(a.value));
      case "BinaryExpr":
        return this.exprUsesPropagation(expr.left) || this.exprUsesPropagation(expr.right);
      case "UnaryExpr":
        return this.exprUsesPropagation(expr.operand);
      case "PipelineExpr":
        return this.exprUsesPropagation(expr.source) ||
          expr.steps.some(s => s.args.some(a => this.exprUsesPropagation(a.value)));
      case "DotAccess":
        return this.exprUsesPropagation(expr.object);
      case "WithExpr":
        return this.exprUsesPropagation(expr.base) ||
          expr.updates.some(u => this.exprUsesPropagation(u.value));
      case "AwaitExpr":
        return this.exprUsesPropagation(expr.expr);
      case "ListLiteral":
        return expr.elements.some(e => this.exprUsesPropagation(e));
      default:
        return false;
    }
  }

  private emitTrampolineInternal(func: FunctionDef): string {
    const params = func.params
      .map((p) => `${p.name}: ${this.emitType(p.type)}`)
      .join(", ");
    const returnType = func.returnType
      ? `Thunk<${this.emitType(func.returnType)}>`
      : "Thunk<void>";

    const lines: string[] = [];
    lines.push(`function ${func.name}(${params}): ${returnType} {`);

    for (const stmt of func.body) {
      lines.push(this.emitTrampolineStatement(stmt, 2));
    }

    lines.push("}");
    return lines.join("\n");
  }

  private emitTrampolineWrapper(func: FunctionDef): string {
    const originalName = func.name;
    const internalName = `_trampoline_${originalName}`;
    const params = func.params
      .map((p) => `${p.name}: ${this.emitType(p.type)}`)
      .join(", ");
    const argNames = func.params.map((p) => p.name).join(", ");
    const returnType = func.returnType
      ? `: ${this.emitType(func.returnType)}`
      : "";

    const lines: string[] = [];
    lines.push(`function ${originalName}(${params})${returnType} {`);
    lines.push(`  let __result: Thunk<${func.returnType ? this.emitType(func.returnType) : "void"}> = ${internalName}(${argNames});`);
    lines.push("  while (!__result.done) {");
    lines.push("    __result = __result.fn();");
    lines.push("  }");
    lines.push("  return __result.value;");
    lines.push("}");
    return lines.join("\n");
  }

  private emitTrampolineStatement(stmt: Statement, indent: number): string {
    const pad = " ".repeat(indent);

    switch (stmt.kind) {
      case "ReturnStatement": {
        const expr = stmt.value;
        // Check if the return value is a thunk construct
        if (
          expr.kind === "ConstructExpr" &&
          expr.typeName === "__TrampolineThunk"
        ) {
          const fnField = expr.fields.find((f) => f.name === "fn");
          if (fnField) {
            return `${pad}return { done: false, fn: ${this.emitExpression(fnField.value)} };`;
          }
        }
        return `${pad}return { done: true, value: ${this.emitExpression(expr)} };`;
      }

      case "IfStatement": {
        const lines: string[] = [];
        lines.push(`${pad}if (${this.emitExpression(stmt.condition)}) {`);
        for (const s of stmt.thenBlock) {
          lines.push(this.emitTrampolineStatement(s, indent + 2));
        }
        for (const clause of stmt.elseIfClauses) {
          lines.push(`${pad}} else if (${this.emitExpression(clause.condition)}) {`);
          for (const s of clause.block) {
            lines.push(this.emitTrampolineStatement(s, indent + 2));
          }
        }
        if (stmt.elseBlock) {
          lines.push(`${pad}} else {`);
          for (const s of stmt.elseBlock) {
            lines.push(this.emitTrampolineStatement(s, indent + 2));
          }
        }
        lines.push(`${pad}}`);
        return lines.join("\n");
      }

      default:
        return this.emitStatement(stmt, indent);
    }
  }

  emitStatement(stmt: Statement, indent: number): string {
    const pad = " ".repeat(indent);

    switch (stmt.kind) {
      case "ReturnStatement":
        return `${pad}return ${this.emitExpression(stmt.value)};`;

      case "Assignment":
        return `${pad}let ${stmt.target} = ${this.emitExpression(stmt.value)};`;

      case "ExpressionStatement": {
        // Check for __tailrec_continue sentinel
        if (
          stmt.expr.kind === "IdentifierExpr" &&
          stmt.expr.name === "__tailrec_continue"
        ) {
          return `${pad}continue;`;
        }
        return `${pad}${this.emitExpression(stmt.expr)};`;
      }

      case "IfStatement": {
        const lines: string[] = [];
        lines.push(`${pad}if (${this.emitExpression(stmt.condition)}) {`);
        for (const s of stmt.thenBlock) {
          lines.push(this.emitStatement(s, indent + 2));
        }
        for (const clause of stmt.elseIfClauses) {
          lines.push(
            `${pad}} else if (${this.emitExpression(clause.condition)}) {`
          );
          for (const s of clause.block) {
            lines.push(this.emitStatement(s, indent + 2));
          }
        }
        if (stmt.elseBlock) {
          lines.push(`${pad}} else {`);
          for (const s of stmt.elseBlock) {
            lines.push(this.emitStatement(s, indent + 2));
          }
        }
        lines.push(`${pad}}`);
        return lines.join("\n");
      }

      case "ForStatement":
        return this.emitForStatement(stmt, indent);

      case "MatchStatement": {
        const lines: string[] = [];
        // Emit as if-else chain
        let first = true;
        for (const matchCase of stmt.cases) {
          const prefix = first ? "if" : "} else if";
          first = false;
          const cond = this.emitPatternCondition(
            matchCase.pattern,
            this.emitExpression(stmt.subject)
          );
          lines.push(`${pad}${prefix} (${cond}) {`);
          if (Array.isArray(matchCase.body)) {
            for (const s of matchCase.body) {
              lines.push(this.emitStatement(s, indent + 2));
            }
          } else {
            lines.push(`${pad}  ${this.emitExpression(matchCase.body)};`);
          }
        }
        if (stmt.cases.length > 0) lines.push(`${pad}}`);
        return lines.join("\n");
      }

      case "CheckStatement":
        return `${pad}if (!(${this.emitExpression(stmt.condition)})) return ${this.emitExpression(stmt.fallback)};`;
    }
  }

  private emitForStatement(
    stmt: import("../parser/ast.js").ForStatement,
    indent: number
  ): string {
    const pad = " ".repeat(indent);
    const lines: string[] = [];

    // Check if this is a tailrec/trampoline while(true) sentinel
    if (
      stmt.iterable.kind === "BooleanLiteral" &&
      stmt.iterable.value === true
    ) {
      lines.push(`${pad}while (true) {`);
    } else {
      lines.push(
        `${pad}for (const ${stmt.variable} of ${this.emitExpression(stmt.iterable)}) {`
      );
    }

    for (const s of stmt.body) {
      lines.push(this.emitStatement(s, indent + 2));
    }
    lines.push(`${pad}}`);
    return lines.join("\n");
  }

  emitExpression(expr: Expression): string {
    switch (expr.kind) {
      case "NumberLiteral":
        return String(expr.value);
      case "TextLiteral":
        return JSON.stringify(expr.value);
      case "BooleanLiteral":
        return String(expr.value);
      case "IdentifierExpr":
        return expr.name;
      case "SelfExpr":
        return "this";
      case "DotAccess":
        return `${this.emitExpression(expr.object)}.${expr.field}`;
      case "ShortDotAccess":
        return `.${expr.field}`;
      case "CallExpr": {
        const callee = this.emitExpression(expr.callee);
        const args = expr.args.map((a) => {
          if (a.name) return `/* ${a.name}: */ ${this.emitExpression(a.value)}`;
          return this.emitExpression(a.value);
        });
        return `${callee}(${args.join(", ")})`;
      }
      case "BinaryExpr": {
        const op = expr.operator === "and" ? "&&" : expr.operator === "or" ? "||" : expr.operator;
        return `(${this.emitExpression(expr.left)} ${op} ${this.emitExpression(expr.right)})`;
      }
      case "UnaryExpr": {
        const op = expr.operator === "not" ? "!" : expr.operator;
        return `${op}${this.emitExpression(expr.operand)}`;
      }
      case "PipelineExpr": {
        let result = this.emitExpression(expr.source);
        for (const step of expr.steps) {
          const callee = this.emitExpression(step.callee);
          const extraArgs = step.args.map((a) => this.emitExpression(a.value));
          result = `${callee}(${[result, ...extraArgs].join(", ")})`;
        }
        return result;
      }
      case "LambdaExpr": {
        const params = expr.params.map((p) => p.name).join(", ");
        return `(${params}) => ${this.emitExpression(expr.body)}`;
      }
      case "PropagateExpr": {
        this.needsResultHelper = true;
        return `__propagateResult(${this.emitExpression(expr.expr)})`;
      }
      case "WithExpr": {
        const updates = expr.updates
          .map((u) => `${u.field}: ${this.emitExpression(u.value)}`)
          .join(", ");
        return `{ ...${this.emitExpression(expr.base)}, ${updates} }`;
      }
      case "ListLiteral":
        return `[${expr.elements.map((e) => this.emitExpression(e)).join(", ")}]`;
      case "ConstructExpr": {
        const fields = expr.fields
          .map((f) => `${f.name}: ${this.emitExpression(f.value)}`)
          .join(", ");
        return `{ ${fields} }`;
      }
      case "AwaitExpr":
        return `await ${this.emitExpression(expr.expr)}`;
      case "AllExpr": {
        const exprs = expr.exprs.map((e) => this.emitExpression(e)).join(", ");
        return `await Promise.all([${exprs}])`;
      }
    }
  }

  private emitPatternCondition(
    pattern: import("../parser/ast.js").Pattern,
    subject: string
  ): string {
    switch (pattern.kind) {
      case "LiteralPattern":
        return `${subject} === ${JSON.stringify(pattern.value)}`;
      case "IdentifierPattern":
        return "true"; // binding pattern, always matches
      case "WildcardPattern":
        return "true";
      case "ConstructorPattern":
        return `${subject}.kind === ${JSON.stringify(pattern.name)}`;
      case "TuplePattern":
        return pattern.elements
          .map((el, i) => this.emitPatternCondition(el, `${subject}[${i}]`))
          .join(" && ");
    }
  }

  emitType(type: TypeNode): string {
    switch (type.kind) {
      case "SimpleType": {
        const map: Record<string, string> = {
          Text: "string",
          Number: "number",
          Boolean: "boolean",
          Void: "void",
        };
        return map[type.name] ?? type.name;
      }
      case "GenericType": {
        if (type.name === "Result" && type.typeArgs.length === 2) {
          const ok = this.emitType(type.typeArgs[0]);
          const err = this.emitType(type.typeArgs[1]);
          return `{ ok: true; value: ${ok} } | { ok: false; error: ${err} }`;
        }
        if (type.name === "Maybe" && type.typeArgs.length === 1) {
          return `${this.emitType(type.typeArgs[0])} | null`;
        }
        if (type.name === "List" && type.typeArgs.length === 1) {
          return `${this.emitType(type.typeArgs[0])}[]`;
        }
        if (type.name === "Map" && type.typeArgs.length === 2) {
          return `Map<${this.emitType(type.typeArgs[0])}, ${this.emitType(type.typeArgs[1])}>`;
        }
        if (type.name === "Set" && type.typeArgs.length === 1) {
          return `Set<${this.emitType(type.typeArgs[0])}>`;
        }
        const args = type.typeArgs.map((a) => this.emitType(a)).join(", ");
        return `${type.name}<${args}>`;
      }
      case "FunctionType": {
        const params = type.params
          .map((p, i) => `arg${i}: ${this.emitType(p)}`)
          .join(", ");
        return `(${params}) => ${this.emitType(type.returnType)}`;
      }
    }
  }
}
