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
  TAILREC_PREFIX,
} from "../typechecker/tailrec.js";
import {
  findTrampolineGroups,
  validateTrampolineGroup,
  transformTrampolineGroup,
} from "../typechecker/trampoline.js";
import { PRELUDE_FUNCTIONS, PRELUDE_CODE } from "../runtime/prelude.js";
import { COLLECTION_FUNCTIONS, COLLECTIONS_CODE } from "../runtime/collections.js";

/**
 * Emits TypeScript code from a LithoLang AST.
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

  private exportPrefix(exported: boolean): string {
    return exported ? "export " : "";
  }

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
          chunks.push(this.emitFunctionDef(decl, decl.isExported ?? false));
          chunks.push("");
          break;
        case "StructDef":
          chunks.push(this.emitStructDef(decl, decl.isExported ?? false));
          chunks.push("");
          break;
        case "EnumDef":
          chunks.push(this.emitEnumDef(decl, decl.isExported ?? false));
          chunks.push("");
          break;
        case "TypeAlias":
          chunks.push(this.emitTypeAlias(decl, decl.isExported ?? false));
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
        `  if (!result.ok) throw { __lithoPropagate: true, value: result };`,
        `  return result.value;`,
        `}`,
        "",
      );
    }
    if (this.needsMaybeHelper) {
      helpers.push(
        `function __propagateMaybe<T>(value: T | null): T {`,
        `  if (value === null) throw { __lithoPropagate: true, value: null };`,
        `  return value;`,
        `}`,
        "",
      );
    }

    // Prepend runtime modules if their functions are used
    const runtime: string[] = [];
    const refs = this.collectIdentifiers(program);
    const userDefined = new Set(
      program.declarations.map(d => (d as { name?: string }).name).filter(Boolean)
    );
    const needsPrelude = [...PRELUDE_FUNCTIONS].some(f => refs.has(f) && !userDefined.has(f));
    const needsCollections = [...COLLECTION_FUNCTIONS].some(f => refs.has(f) && !userDefined.has(f));
    if (needsPrelude) runtime.push(PRELUDE_CODE);
    if (needsCollections) runtime.push(COLLECTIONS_CODE);

    const allChunks = [...runtime, ...helpers, ...chunks];
    return allChunks.join("\n").trimEnd() + "\n";
  }

  private collectIdentifiers(program: Program): Set<string> {
    const ids = new Set<string>();
    for (const decl of program.declarations) {
      if (decl.kind === "FunctionDef") {
        this.collectIdsFromBody(decl.body, ids);
        for (const param of decl.params) {
          if (param.defaultValue) this.collectIdsFromExpr(param.defaultValue, ids);
        }
      }
      if (decl.kind === "StructDef") {
        for (const method of decl.methods) {
          this.collectIdsFromBody(method.body, ids);
        }
      }
    }
    return ids;
  }

  private collectIdsFromBody(body: Statement[], ids: Set<string>): void {
    for (const stmt of body) {
      switch (stmt.kind) {
        case "ReturnStatement":
          this.collectIdsFromExpr(stmt.value, ids); break;
        case "Assignment":
          this.collectIdsFromExpr(stmt.value, ids); break;
        case "ExpressionStatement":
          this.collectIdsFromExpr(stmt.expr, ids); break;
        case "IfStatement":
          this.collectIdsFromExpr(stmt.condition, ids);
          this.collectIdsFromBody(stmt.thenBlock, ids);
          for (const c of stmt.elseIfClauses) {
            this.collectIdsFromExpr(c.condition, ids);
            this.collectIdsFromBody(c.block, ids);
          }
          if (stmt.elseBlock) this.collectIdsFromBody(stmt.elseBlock, ids);
          break;
        case "ForStatement":
          this.collectIdsFromExpr(stmt.iterable, ids);
          this.collectIdsFromBody(stmt.body, ids);
          break;
        case "MatchStatement":
          this.collectIdsFromExpr(stmt.subject, ids);
          for (const c of stmt.cases) {
            if (c.guard) this.collectIdsFromExpr(c.guard, ids);
            if (Array.isArray(c.body)) this.collectIdsFromBody(c.body, ids);
            else this.collectIdsFromExpr(c.body, ids);
          }
          break;
        case "CheckStatement":
          this.collectIdsFromExpr(stmt.condition, ids);
          this.collectIdsFromExpr(stmt.fallback, ids);
          break;
        case "RepeatStatement":
          this.collectIdsFromExpr(stmt.condition, ids);
          this.collectIdsFromBody(stmt.body, ids);
          break;
        case "TryRescueStatement":
          this.collectIdsFromBody(stmt.tryBlock, ids);
          this.collectIdsFromBody(stmt.rescueBlock, ids);
          break;
      }
    }
  }

  private collectIdsFromExpr(expr: Expression, ids: Set<string>): void {
    switch (expr.kind) {
      case "IdentifierExpr": ids.add(expr.name); break;
      case "CallExpr":
        this.collectIdsFromExpr(expr.callee, ids);
        for (const a of expr.args) this.collectIdsFromExpr(a.value, ids);
        break;
      case "BinaryExpr":
        this.collectIdsFromExpr(expr.left, ids);
        this.collectIdsFromExpr(expr.right, ids);
        break;
      case "UnaryExpr":
        this.collectIdsFromExpr(expr.operand, ids); break;
      case "PipelineExpr":
        this.collectIdsFromExpr(expr.source, ids);
        for (const s of expr.steps) {
          this.collectIdsFromExpr(s.callee, ids);
          for (const a of s.args) this.collectIdsFromExpr(a.value, ids);
        }
        break;
      case "DotAccess":
        this.collectIdsFromExpr(expr.object, ids); break;
      case "LambdaExpr":
        if (expr.blockBody) {
          this.collectIdsFromBody(expr.blockBody, ids);
        }
        this.collectIdsFromExpr(expr.body, ids); break;
      case "PropagateExpr":
      case "AwaitExpr":
        this.collectIdsFromExpr(expr.expr, ids); break;
      case "WithExpr":
        this.collectIdsFromExpr(expr.base, ids);
        for (const u of expr.updates) this.collectIdsFromExpr(u.value, ids);
        break;
      case "ListLiteral":
      case "TupleExpr":
        for (const e of expr.elements) this.collectIdsFromExpr(e, ids);
        break;
      case "ConstructExpr":
        for (const f of expr.fields) this.collectIdsFromExpr(f.value, ids);
        break;
      case "AllExpr":
        for (const e of expr.exprs) this.collectIdsFromExpr(e, ids);
        break;
      case "RangeExpr":
        ids.add("range");
        this.collectIdsFromExpr(expr.start, ids);
        this.collectIdsFromExpr(expr.end, ids);
        break;
      case "ComprehensionExpr":
        this.collectIdsFromExpr(expr.iterable, ids);
        if (expr.filter) this.collectIdsFromExpr(expr.filter, ids);
        this.collectIdsFromExpr(expr.body, ids);
        break;
      default: break;
    }
  }

  emitFunctionDef(func: FunctionDef, exported = false): string {
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

    return this.emitFunction(targetFunc, tailRecResult.isTailRecursive, exported);
  }

  emitStructDef(struct: StructDef, exported = false): string {
    const lines: string[] = [];
    lines.push(`${this.exportPrefix(exported)}interface ${struct.name} {`);
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

  emitEnumDef(enumDef: EnumDef, exported = false): string {
    const hasData = enumDef.variants.some(v => v.fields.length > 0);

    if (!hasData) {
      // Simple enum — emit as TypeScript enum
      const lines: string[] = [];
      lines.push(`${this.exportPrefix(exported)}enum ${enumDef.name} {`);
      for (const variant of enumDef.variants) {
        lines.push(`  ${variant.name},`);
      }
      lines.push("}");
      return lines.join("\n");
    }

    // Tagged union — emit as discriminated union type + constructor functions
    const lines: string[] = [];
    const variantTypes: string[] = [];
    const constructors: string[] = [];

    for (const variant of enumDef.variants) {
      if (variant.fields.length === 0) {
        variantTypes.push(`{ kind: "${variant.name}" }`);
        constructors.push(`function ${variant.name}(): ${enumDef.name} { return { kind: "${variant.name}" }; }`);
      } else {
        const fieldSigs = variant.fields.map(f => `${f.name}: ${this.emitType(f.type)}`);
        variantTypes.push(`{ kind: "${variant.name}"; ${fieldSigs.join("; ")} }`);
        const obj = variant.fields.map(f => f.name).join(", ");
        constructors.push(`function ${variant.name}(${fieldSigs.join(", ")}): ${enumDef.name} { return { kind: "${variant.name}", ${obj} }; }`);
      }
    }

    lines.push(`${this.exportPrefix(exported)}type ${enumDef.name} = ${variantTypes.join(" | ")};`);
    lines.push(...constructors);
    return lines.join("\n");
  }

  emitTypeAlias(alias: TypeAlias, exported = false): string {
    return `${this.exportPrefix(exported)}type ${alias.name} = ${this.emitType(alias.type)};`;
  }

  emitImportDecl(decl: ImportDecl): string {
    const names = decl.names.join(", ");
    const source = this.resolveImportPath(decl.source);
    return `import { ${names} } from "${source}";`;
  }

  emitExternDef(decl: ExternDef): string {
    const source = this.resolveImportPath(decl.source);
    return `import { ${decl.name} } from "${source}";`;
  }

  /**
   * For relative imports (starting with ./ or ../), append .js extension
   * so TypeScript ESM resolution works correctly.
   */
  private resolveImportPath(source: string): string {
    if ((source.startsWith("./") || source.startsWith("../")) &&
        !source.endsWith(".js") && !source.endsWith(".ts")) {
      return `${source}.js`;
    }
    return source;
  }

  private emitFunction(func: FunctionDef, isTailRecOptimized: boolean, exported = false): string {
    const params = func.params
      .map((p) => {
        const def = p.defaultValue ? ` = ${this.emitExpression(p.defaultValue)}` : "";
        return `${p.name}: ${this.emitType(p.type)}${def}`;
      })
      .join(", ");
    const returnType = func.returnType
      ? `: ${this.emitType(func.returnType)}`
      : "";
    const asyncPrefix = func.isAsync ? "async " : "";
    const usesPropagation = this.bodyUsesPropagation(func.body);

    const lines: string[] = [];
    lines.push(`${this.exportPrefix(exported)}${asyncPrefix}function ${func.name}(${params})${returnType} {`);

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
      lines.push("    if (__e && typeof __e === \"object\" && \"__lithoPropagate\" in __e) return (__e as { value: unknown }).value;");
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
      case "RepeatStatement":
        return this.exprUsesPropagation(stmt.condition) ||
          this.bodyUsesPropagation(stmt.body);
      case "TryRescueStatement":
        return this.bodyUsesPropagation(stmt.tryBlock) ||
          this.bodyUsesPropagation(stmt.rescueBlock);
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
      case "TupleExpr":
        return expr.elements.some(e => this.exprUsesPropagation(e));
      case "ComprehensionExpr":
        return this.exprUsesPropagation(expr.iterable) ||
          (expr.filter ? this.exprUsesPropagation(expr.filter) : false) ||
          this.exprUsesPropagation(expr.body);
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

      case "Assignment": {
        if (stmt.isReassignment) {
          return `${pad}${stmt.target} = ${this.emitExpression(stmt.value)};`;
        }
        const binding = stmt.target.startsWith(TAILREC_PREFIX) ? "let" : "const";
        return `${pad}${binding} ${stmt.target} = ${this.emitExpression(stmt.value)};`;
      }

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
        const subjectExpr = this.emitExpression(stmt.subject);
        for (const matchCase of stmt.cases) {
          const prefix = first ? "if" : "} else if";
          first = false;
          const bindings: { name: string; expr: string }[] = [];
          let cond = this.emitPatternCondition(
            matchCase.pattern,
            subjectExpr,
            bindings
          );
          // When a guard references bound variables, we need to inline the
          // bindings into the condition so they're available for the guard.
          if (matchCase.guard && bindings.length > 0) {
            // Use an IIFE to bind variables before evaluating the guard
            const bindingAssignments = bindings
              .map((b) => `const ${b.name} = ${b.expr}`)
              .join(", ");
            const guardExpr = this.emitExpression(matchCase.guard);
            cond = `${cond} && (() => { ${bindingAssignments}; return ${guardExpr}; })()`;
            lines.push(`${pad}${prefix} (${cond}) {`);
            // Re-emit bindings inside the block for use in the body
            for (const binding of bindings) {
              lines.push(`${pad}  const ${binding.name} = ${binding.expr};`);
            }
          } else {
            if (matchCase.guard) {
              cond = `${cond} && (${this.emitExpression(matchCase.guard)})`;
            }
            lines.push(`${pad}${prefix} (${cond}) {`);
            for (const binding of bindings) {
              lines.push(`${pad}  const ${binding.name} = ${binding.expr};`);
            }
          }
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

      case "RepeatStatement": {
        const lines: string[] = [];
        lines.push(`${pad}while (${this.emitExpression(stmt.condition)}) {`);
        for (const s of stmt.body) {
          lines.push(this.emitStatement(s, indent + 2));
        }
        lines.push(`${pad}}`);
        return lines.join("\n");
      }

      case "TryRescueStatement": {
        const lines: string[] = [];
        lines.push(`${pad}try {`);
        for (const s of stmt.tryBlock) {
          lines.push(this.emitStatement(s, indent + 2));
        }
        lines.push(`${pad}} catch (${stmt.errorVar}: unknown) {`);
        for (const s of stmt.rescueBlock) {
          lines.push(this.emitStatement(s, indent + 2));
        }
        lines.push(`${pad}}`);
        return lines.join("\n");
      }
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
      case "TextLiteral": {
        // Detect {interpolation} patterns and emit as template literal
        if (expr.value.includes("{") && expr.value.includes("}")) {
          const escaped = expr.value
            .replace(/\\/g, "\\\\")
            .replace(/`/g, "\\`")
            .replace(/\{([^}]+)\}/g, (_match, inner: string) => `\${${inner.trim()}}`);
          return `\`${escaped}\``;
        }
        return JSON.stringify(expr.value);
      }
      case "BooleanLiteral":
        return String(expr.value);
      case "IdentifierExpr":
        if (expr.name === "none") return "null";
        return expr.name;
      case "SelfExpr":
        return "this";
      case "DotAccess":
        return `${this.emitExpression(expr.object)}.${expr.field}`;
      case "ShortDotAccess":
        return `.${expr.field}`;
      case "CallExpr": {
        const callee = this.emitExpression(expr.callee);
        // Built-in Result/Maybe constructors
        if (expr.callee.kind === "IdentifierExpr") {
          if (expr.callee.name === "ok" && expr.args.length === 1) {
            return `{ ok: true, value: ${this.emitExpression(expr.args[0].value)} }`;
          }
          if (expr.callee.name === "err" && expr.args.length === 1) {
            return `{ ok: false, error: ${this.emitExpression(expr.args[0].value)} }`;
          }
          if (expr.callee.name === "some" && expr.args.length === 1) {
            return this.emitExpression(expr.args[0].value);
          }
        }
        const args = expr.args.map((a) => this.emitExpression(a.value));
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
        if (expr.blockBody) {
          const lines: string[] = [];
          lines.push(`(${params}) => {`);
          for (const stmt of expr.blockBody) {
            lines.push(this.emitStatement(stmt, 2));
          }
          lines.push("}");
          return lines.join("\n");
        }
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
      case "TupleExpr":
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

      case "RangeExpr":
        return `range(${this.emitExpression(expr.start)}, ${this.emitExpression(expr.end)})`;

      case "ComprehensionExpr": {
        const iterable = this.emitExpression(expr.iterable);
        const body = this.emitExpression(expr.body);
        if (expr.filter) {
          const filter = this.emitExpression(expr.filter);
          return `${iterable}.filter((${expr.variable}) => ${filter}).map((${expr.variable}) => ${body})`;
        }
        return `${iterable}.map((${expr.variable}) => ${body})`;
      }
    }
  }

  private emitPatternCondition(
    pattern: import("../parser/ast.js").Pattern,
    subject: string,
    bindings: { name: string; expr: string }[]
  ): string {
    switch (pattern.kind) {
      case "LiteralPattern":
        return `${subject} === ${JSON.stringify(pattern.value)}`;
      case "IdentifierPattern":
        bindings.push({ name: pattern.name, expr: subject });
        return "true"; // binding pattern, always matches
      case "WildcardPattern":
        return "true";
      case "ConstructorPattern": {
        const cond = `${subject}.kind === ${JSON.stringify(pattern.name)}`;
        if (pattern.inner) {
          const innerCond = this.emitPatternCondition(pattern.inner, subject, bindings);
          if (innerCond === "true") return cond;
          return `${cond} && ${innerCond}`;
        }
        return cond;
      }
      case "TuplePattern":
        return pattern.elements
          .map((el, i) => this.emitPatternCondition(el, `${subject}[${i}]`, bindings))
          .join(" && ");
      case "OrPattern":
        return "(" + pattern.patterns
          .map(p => this.emitPatternCondition(p, subject, bindings))
          .join(" || ") + ")";
      case "ListPattern": {
        const conditions: string[] = [];
        if (pattern.elements.length > 0) {
          conditions.push(`${subject}.length >= ${pattern.elements.length}`);
        } else if (!pattern.rest) {
          conditions.push(`${subject}.length === 0`);
        }
        for (let i = 0; i < pattern.elements.length; i++) {
          const elemCond = this.emitPatternCondition(pattern.elements[i], `${subject}[${i}]`, bindings);
          if (elemCond !== "true") conditions.push(elemCond);
        }
        if (pattern.rest) {
          bindings.push({ name: pattern.rest, expr: `${subject}.slice(${pattern.elements.length})` });
        }
        return conditions.length > 0 ? conditions.join(" && ") : "true";
      }
      case "StructPattern": {
        const conditions: string[] = [];
        for (const field of pattern.fields) {
          const fieldCond = this.emitPatternCondition(field.pattern, `${subject}.${field.fieldName}`, bindings);
          if (fieldCond !== "true") conditions.push(fieldCond);
        }
        return conditions.length > 0 ? conditions.join(" && ") : "true";
      }
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
        if (type.name === "Tuple" && type.typeArgs.length >= 2) {
          return `[${type.typeArgs.map((a) => this.emitType(a)).join(", ")}]`;
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
      case "UnionType":
        return type.types.map(t => this.emitType(t)).join(" | ");
    }
  }
}
