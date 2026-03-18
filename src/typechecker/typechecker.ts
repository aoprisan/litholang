import {
  Program,
  Declaration,
  FunctionDef,
  StructDef,
  EnumDef,
  TypeAlias,
  Statement,
  Expression,
  TypeNode,
  Position,
  Parameter,
} from "../parser/ast.js";

// ─── Type Representations ───

export type LithoType =
  | { kind: "primitive"; name: "Number" | "Text" | "Boolean" | "Void" }
  | { kind: "list"; element: LithoType }
  | { kind: "map"; key: LithoType; value: LithoType }
  | { kind: "set"; element: LithoType }
  | { kind: "maybe"; inner: LithoType }
  | { kind: "result"; ok: LithoType; error: LithoType }
  | { kind: "tuple"; elements: LithoType[] }
  | { kind: "function"; params: LithoType[]; returnType: LithoType }
  | { kind: "struct"; name: string; fields: Map<string, LithoType> }
  | { kind: "enum"; name: string; variants: string[] }
  | { kind: "named"; name: string }
  | { kind: "unknown" };

export interface TypeError {
  message: string;
  position: Position;
}

// ─── Environment (scope chain) ───

interface Scope {
  variables: Map<string, LithoType>;
  parent: Scope | null;
}

function createScope(parent: Scope | null): Scope {
  return { variables: new Map(), parent };
}

function lookupVariable(scope: Scope, name: string): LithoType | null {
  const found = scope.variables.get(name);
  if (found) return found;
  if (scope.parent) return lookupVariable(scope.parent, name);
  return null;
}

// ─── Type Checker ───

export class TypeChecker {
  private errors: TypeError[] = [];
  private structs = new Map<string, StructDef>();
  private enums = new Map<string, EnumDef>();
  private typeAliases = new Map<string, TypeNode>();
  private functions = new Map<string, FunctionDef>();
  private inAsyncFunction = false;

  check(program: Program): TypeError[] {
    this.errors = [];
    this.structs.clear();
    this.enums.clear();
    this.typeAliases.clear();
    this.functions.clear();

    // First pass: register all declarations
    for (const decl of program.declarations) {
      this.registerDeclaration(decl);
    }

    // Second pass: check function bodies
    for (const decl of program.declarations) {
      this.checkDeclaration(decl);
    }

    return this.errors;
  }

  private registerDeclaration(decl: Declaration): void {
    switch (decl.kind) {
      case "FunctionDef":
        if (this.functions.has(decl.name)) {
          this.addError(`Duplicate function definition '${decl.name}'`, decl.position);
        }
        this.functions.set(decl.name, decl);
        break;
      case "StructDef":
        if (this.structs.has(decl.name)) {
          this.addError(`Duplicate struct definition '${decl.name}'`, decl.position);
        }
        this.structs.set(decl.name, decl);
        break;
      case "EnumDef":
        if (this.enums.has(decl.name)) {
          this.addError(`Duplicate enum definition '${decl.name}'`, decl.position);
        }
        this.enums.set(decl.name, decl);
        break;
      case "TypeAlias":
        this.typeAliases.set(decl.name, decl.type);
        break;
      case "ImportDecl":
        // Imports introduce names we can't validate — treat as known
        break;
      case "ExternDef":
        if (this.functions.has(decl.name)) {
          this.addError(`Duplicate function definition '${decl.name}'`, decl.position);
        }
        // Register extern as a synthetic FunctionDef for call-site validation
        this.functions.set(decl.name, {
          kind: "FunctionDef",
          name: decl.name,
          params: decl.params,
          returnType: decl.returnType,
          body: [],
          annotations: decl.annotations,
          isAsync: decl.isAsync,
          position: decl.position,
        });
        break;
    }
  }

  private checkDeclaration(decl: Declaration): void {
    switch (decl.kind) {
      case "FunctionDef":
        this.checkFunction(decl);
        break;
      case "StructDef":
        this.checkStruct(decl);
        break;
      case "EnumDef":
        // Enum variants are just names — nothing to validate
        break;
      case "TypeAlias":
        this.validateTypeNode(decl.type);
        break;
      case "ImportDecl":
        break;
      case "ExternDef":
        // Validate parameter and return types
        for (const param of decl.params) {
          this.validateTypeNode(param.type);
        }
        if (decl.returnType) {
          this.validateTypeNode(decl.returnType);
        }
        break;
    }
  }

  private checkStruct(struct: StructDef): void {
    const fieldNames = new Set<string>();
    for (const field of struct.fields) {
      if (fieldNames.has(field.name)) {
        this.addError(
          `Duplicate field '${field.name}' in struct '${struct.name}'`,
          struct.position,
        );
      }
      fieldNames.add(field.name);
      this.validateTypeNode(field.type);
    }

    for (const method of struct.methods) {
      this.checkFunction(method);
    }
  }

  private checkFunction(func: FunctionDef): void {
    const previousAsync = this.inAsyncFunction;
    this.inAsyncFunction = func.isAsync;

    // Create scope with parameters
    const scope = createScope(null);
    const paramNames = new Set<string>();

    for (const param of func.params) {
      if (paramNames.has(param.name)) {
        this.addError(
          `Duplicate parameter '${param.name}' in function '${func.name}'`,
          func.position,
        );
      }
      paramNames.add(param.name);
      this.validateTypeNode(param.type);
      scope.variables.set(param.name, this.resolveTypeNode(param.type));
    }

    if (func.returnType) {
      this.validateTypeNode(func.returnType);
    }

    // Check return type consistency
    const declaredReturn = func.returnType
      ? this.resolveTypeNode(func.returnType)
      : null;
    this.checkBody(func.body, scope, declaredReturn, func.name);

    this.inAsyncFunction = previousAsync;
  }

  private checkBody(
    body: Statement[],
    scope: Scope,
    declaredReturn: LithoType | null,
    functionName: string,
  ): void {
    for (const stmt of body) {
      this.checkStatement(stmt, scope, declaredReturn, functionName);
    }
  }

  private checkStatement(
    stmt: Statement,
    scope: Scope,
    declaredReturn: LithoType | null,
    functionName: string,
  ): void {
    switch (stmt.kind) {
      case "Assignment": {
        const valueType = this.inferExpression(stmt.value, scope);
        // Introduce or shadow the variable
        scope.variables.set(stmt.target, valueType);
        break;
      }

      case "ReturnStatement": {
        const returnType = this.inferExpression(stmt.value, scope);
        if (declaredReturn && !this.isAssignable(returnType, declaredReturn)) {
          this.addError(
            `Return type mismatch in '${functionName}': ` +
            `expected ${this.typeToString(declaredReturn)}, ` +
            `got ${this.typeToString(returnType)}`,
            stmt.position,
          );
        }
        break;
      }

      case "IfStatement": {
        this.inferExpression(stmt.condition, scope);
        const thenScope = createScope(scope);
        this.checkBody(stmt.thenBlock, thenScope, declaredReturn, functionName);
        for (const clause of stmt.elseIfClauses) {
          this.inferExpression(clause.condition, scope);
          const clauseScope = createScope(scope);
          this.checkBody(clause.block, clauseScope, declaredReturn, functionName);
        }
        if (stmt.elseBlock) {
          const elseScope = createScope(scope);
          this.checkBody(stmt.elseBlock, elseScope, declaredReturn, functionName);
        }
        break;
      }

      case "ForStatement": {
        this.inferExpression(stmt.iterable, scope);
        const loopScope = createScope(scope);
        // Loop variable type is inferred from iterable
        const iterableType = this.inferExpression(stmt.iterable, scope);
        if (iterableType.kind === "list") {
          loopScope.variables.set(stmt.variable, iterableType.element);
        } else {
          loopScope.variables.set(stmt.variable, { kind: "unknown" });
        }
        this.checkBody(stmt.body, loopScope, declaredReturn, functionName);
        break;
      }

      case "MatchStatement": {
        const subjectType = this.inferExpression(stmt.subject, scope);
        for (const matchCase of stmt.cases) {
          const caseScope = createScope(scope);
          // Bind pattern identifiers with types from subject
          this.bindPattern(matchCase.pattern, caseScope, subjectType);
          // Type check guard expression
          if (matchCase.guard) {
            this.inferExpression(matchCase.guard, caseScope);
          }
          if (Array.isArray(matchCase.body)) {
            this.checkBody(matchCase.body, caseScope, declaredReturn, functionName);
          } else {
            this.inferExpression(matchCase.body, caseScope);
          }
        }
        // Exhaustiveness checking for enums
        this.checkMatchExhaustiveness(subjectType, stmt);
        break;
      }

      case "CheckStatement": {
        this.inferExpression(stmt.condition, scope);
        this.inferExpression(stmt.fallback, scope);
        break;
      }

      case "ExpressionStatement": {
        this.inferExpression(stmt.expr, scope);
        break;
      }

      case "RepeatStatement": {
        this.inferExpression(stmt.condition, scope);
        for (const s of stmt.body) this.checkStatement(s, scope, declaredReturn, functionName);
        break;
      }

      case "TryRescueStatement": {
        const tryScope = createScope(scope);
        for (const s of stmt.tryBlock) this.checkStatement(s, tryScope, declaredReturn, functionName);
        const rescueScope = createScope(scope);
        rescueScope.variables.set(stmt.errorVar, { kind: "unknown" });
        for (const s of stmt.rescueBlock) this.checkStatement(s, rescueScope, declaredReturn, functionName);
        break;
      }
    }
  }

  private bindPattern(
    pattern: import("../parser/ast.js").Pattern,
    scope: Scope,
    matchedType?: LithoType,
  ): void {
    switch (pattern.kind) {
      case "IdentifierPattern":
        scope.variables.set(pattern.name, matchedType ?? { kind: "unknown" });
        break;
      case "TuplePattern":
        for (let i = 0; i < pattern.elements.length; i++) {
          const elType = matchedType?.kind === "tuple" && i < matchedType.elements.length
            ? matchedType.elements[i]
            : undefined;
          this.bindPattern(pattern.elements[i], scope, elType);
        }
        break;
      case "ConstructorPattern":
        if (pattern.inner) {
          this.bindPattern(pattern.inner, scope);
        }
        break;
      case "OrPattern":
        for (const p of pattern.patterns) {
          this.bindPattern(p, scope, matchedType);
        }
        break;
      case "ListPattern":
        for (const el of pattern.elements) {
          const elType = matchedType?.kind === "list" ? matchedType.element : undefined;
          this.bindPattern(el, scope, elType);
        }
        if (pattern.rest) {
          scope.variables.set(pattern.rest, matchedType?.kind === "list" ? matchedType : { kind: "unknown" });
        }
        break;
      case "StructPattern":
        for (const f of pattern.fields) {
          const fieldType = matchedType?.kind === "struct"
            ? matchedType.fields.get(f.name)
            : undefined;
          this.bindPattern(f.pattern, scope, fieldType);
        }
        break;
      default:
        break;
    }
  }

  private inferExpression(expr: Expression, scope: Scope): LithoType {
    switch (expr.kind) {
      case "NumberLiteral":
        return { kind: "primitive", name: "Number" };

      case "TextLiteral":
        // Type-check interpolation expressions
        if (expr.segments) {
          for (const seg of expr.segments) {
            if ("expr" in seg) {
              this.inferExpression(seg.expr, scope);
            }
          }
        }
        return { kind: "primitive", name: "Text" };

      case "BooleanLiteral":
        return { kind: "primitive", name: "Boolean" };

      case "IdentifierExpr": {
        // Built-in: none → Maybe<T> (null)
        if (expr.name === "none") {
          return { kind: "maybe", inner: { kind: "unknown" } };
        }
        const varType = lookupVariable(scope, expr.name);
        if (varType) return varType;

        // Check if it's a known function name
        if (this.functions.has(expr.name)) return { kind: "unknown" };
        // Check if it's an enum variant or struct constructor
        if (this.structs.has(expr.name) || this.enums.has(expr.name)) {
          return { kind: "unknown" };
        }
        // Check if it's an imported name (we don't track import types)
        // Don't error on unknown identifiers that might come from imports
        // Only error on names we definitely can't resolve
        return { kind: "unknown" };
      }

      case "SelfExpr":
        return { kind: "unknown" };

      case "DotAccess": {
        const objType = this.inferExpression(expr.object, scope);
        if (objType.kind === "struct") {
          const fieldType = objType.fields.get(expr.field);
          if (fieldType) return fieldType;
        }
        return { kind: "unknown" };
      }

      case "ShortDotAccess":
        return { kind: "unknown" };

      case "CallExpr": {
        // Check callee and infer args
        this.inferExpression(expr.callee, scope);
        for (const arg of expr.args) {
          this.inferExpression(arg.value, scope);
        }
        // Built-in Result/Maybe constructors
        if (expr.callee.kind === "IdentifierExpr") {
          if (expr.callee.name === "ok" && expr.args.length === 1) {
            const innerType = this.inferExpression(expr.args[0].value, scope);
            return { kind: "result", ok: innerType, error: { kind: "unknown" } };
          }
          if (expr.callee.name === "err" && expr.args.length === 1) {
            const errorType = this.inferExpression(expr.args[0].value, scope);
            return { kind: "result", ok: { kind: "unknown" }, error: errorType };
          }
          if (expr.callee.name === "some" && expr.args.length === 1) {
            const innerType = this.inferExpression(expr.args[0].value, scope);
            return { kind: "maybe", inner: innerType };
          }
        }
        // Infer return type from known functions
        if (expr.callee.kind === "IdentifierExpr") {
          const func = this.functions.get(expr.callee.name);
          if (func) {
            this.checkCallArgCount(expr, func, scope);
            if (func.returnType) {
              return this.resolveTypeNode(func.returnType);
            }
          }
        }
        return { kind: "unknown" };
      }

      case "BinaryExpr": {
        const left = this.inferExpression(expr.left, scope);
        const right = this.inferExpression(expr.right, scope);

        // Type check numeric operations
        const arithmeticOps = ["+", "-", "*", "/", "%"];
        if (arithmeticOps.includes(expr.operator)) {
          if (
            left.kind === "primitive" && left.name === "Number" &&
            right.kind === "primitive" && right.name === "Number"
          ) {
            return { kind: "primitive", name: "Number" };
          }
          // String concatenation
          if (
            expr.operator === "+" &&
            left.kind === "primitive" && left.name === "Text" &&
            right.kind === "primitive" && right.name === "Text"
          ) {
            return { kind: "primitive", name: "Text" };
          }
          // Don't error on unknown types (may come from imports/inference gaps)
          if (left.kind !== "unknown" && right.kind !== "unknown") {
            if (
              arithmeticOps.includes(expr.operator) &&
              expr.operator !== "+" &&
              !(left.kind === "primitive" && left.name === "Number") &&
              !(right.kind === "primitive" && right.name === "Number")
            ) {
              this.addError(
                `Operator '${expr.operator}' requires Number operands`,
                expr.position,
              );
            }
          }
          return { kind: "unknown" };
        }

        // Comparison operators return Boolean
        const comparisonOps = ["==", "!=", "<", ">", "<=", ">="];
        if (comparisonOps.includes(expr.operator)) {
          return { kind: "primitive", name: "Boolean" };
        }

        // Logical operators return Boolean
        if (expr.operator === "and" || expr.operator === "or") {
          return { kind: "primitive", name: "Boolean" };
        }

        return { kind: "unknown" };
      }

      case "UnaryExpr": {
        const operand = this.inferExpression(expr.operand, scope);
        if (expr.operator === "not") {
          return { kind: "primitive", name: "Boolean" };
        }
        if (expr.operator === "-") {
          return { kind: "primitive", name: "Number" };
        }
        return operand;
      }

      case "PipelineExpr": {
        let currentType = this.inferExpression(expr.source, scope);
        for (const step of expr.steps) {
          this.inferExpression(step.callee, scope);
          for (const arg of step.args) {
            this.inferExpression(arg.value, scope);
          }
          currentType = this.inferPipelineStep(currentType, step, scope);
        }
        return currentType;
      }

      case "LambdaExpr": {
        const lambdaScope = createScope(scope);
        for (const param of expr.params) {
          lambdaScope.variables.set(param.name, this.resolveTypeNode(param.type));
        }
        this.inferExpression(expr.body, lambdaScope);
        return { kind: "unknown" };
      }

      case "ComprehensionExpr": {
        const iterableType = this.inferExpression(expr.iterable, scope);
        const elementType: LithoType =
          iterableType.kind === "list" ? iterableType.element : { kind: "unknown" };

        // Create scope with loop variable bound to element type
        const compScope = createScope(scope);
        compScope.variables.set(expr.variable, elementType);

        if (expr.filter) {
          this.inferExpression(expr.filter, compScope);
        }

        const bodyType = this.inferExpression(expr.body, compScope);
        return { kind: "list", element: bodyType };
      }

      case "PropagateExpr": {
        const innerType = this.inferExpression(expr.expr, scope);
        // ? only valid on Result<T,E> or Maybe<T>
        if (innerType.kind !== "unknown" &&
            innerType.kind !== "result" &&
            innerType.kind !== "maybe") {
          this.addError(
            `Propagation operator '?' can only be used on Result<T,E> or Maybe<T>, ` +
            `got ${this.typeToString(innerType)}`,
            expr.position,
          );
        }
        // Unwrap: Result<T,E> -> T, Maybe<T> -> T
        if (innerType.kind === "result") return innerType.ok;
        if (innerType.kind === "maybe") return innerType.inner;
        return { kind: "unknown" };
      }

      case "WithExpr": {
        this.inferExpression(expr.base, scope);
        for (const update of expr.updates) {
          this.inferExpression(update.value, scope);
        }
        return this.inferExpression(expr.base, scope);
      }

      case "ListLiteral": {
        if (expr.elements.length === 0) {
          return { kind: "list", element: { kind: "unknown" } };
        }
        const first = this.inferExpression(expr.elements[0], scope);
        for (let i = 1; i < expr.elements.length; i++) {
          this.inferExpression(expr.elements[i], scope);
        }
        return { kind: "list", element: first };
      }

      case "ConstructExpr": {
        // Validate struct fields if known
        const struct = this.structs.get(expr.typeName);
        if (struct) {
          const expectedFields = new Set(struct.fields.map(f => f.name));
          for (const field of expr.fields) {
            if (!expectedFields.has(field.name)) {
              this.addError(
                `Unknown field '${field.name}' in struct '${expr.typeName}'`,
                expr.position,
              );
            }
            this.inferExpression(field.value, scope);
          }
          const providedFields = new Set(expr.fields.map(f => f.name));
          for (const expected of struct.fields) {
            if (!providedFields.has(expected.name) && !expected.defaultValue) {
              this.addError(
                `Missing field '${expected.name}' in construction of '${expr.typeName}'`,
                expr.position,
              );
            }
          }
        } else {
          for (const field of expr.fields) {
            this.inferExpression(field.value, scope);
          }
        }
        return { kind: "named", name: expr.typeName };
      }

      case "AwaitExpr": {
        if (!this.inAsyncFunction) {
          this.addError(
            `'await' can only be used inside an async function`,
            expr.position,
          );
        }
        this.inferExpression(expr.expr, scope);
        return { kind: "unknown" };
      }

      case "AllExpr": {
        if (!this.inAsyncFunction) {
          this.addError(
            `'all' can only be used inside an async function`,
            expr.position,
          );
        }
        for (const e of expr.exprs) {
          this.inferExpression(e, scope);
        }
        return { kind: "unknown" };
      }

      case "TupleExpr": {
        const elements = expr.elements.map(el => this.inferExpression(el, scope));
        return { kind: "tuple", elements };
      }

      case "RangeExpr": {
        this.inferExpression(expr.start, scope);
        this.inferExpression(expr.end, scope);
        return { kind: "list", element: { kind: "number" } };
      }
    }
  }

  private checkCallArgCount(
    call: import("../parser/ast.js").CallExpr,
    func: FunctionDef,
    _scope: Scope,
  ): void {
    const expectedMin = func.params.filter(p => !p.defaultValue).length;
    const expectedMax = func.params.length;
    const actual = call.args.length;

    if (actual < expectedMin || actual > expectedMax) {
      if (expectedMin === expectedMax) {
        this.addError(
          `Function '${func.name}' expects ${expectedMin} argument(s), got ${actual}`,
          call.position,
        );
      } else {
        this.addError(
          `Function '${func.name}' expects ${expectedMin}-${expectedMax} argument(s), got ${actual}`,
          call.position,
        );
      }
    }
  }

  private validateTypeNode(type: TypeNode): void {
    switch (type.kind) {
      case "SimpleType": {
        const builtins = new Set([
          "Text", "Number", "Boolean", "Void",
          "Duration", "Date", "Timestamp", "Error",
        ]);
        if (
          !builtins.has(type.name) &&
          !this.structs.has(type.name) &&
          !this.enums.has(type.name) &&
          !this.typeAliases.has(type.name)
        ) {
          this.addError(`Unknown type '${type.name}'`, type.position);
        }
        break;
      }
      case "GenericType": {
        const builtinGenerics = new Set([
          "List", "Map", "Set", "Maybe", "Result", "Tuple",
        ]);
        if (!builtinGenerics.has(type.name) && !this.typeAliases.has(type.name)) {
          this.addError(`Unknown generic type '${type.name}'`, type.position);
        }
        for (const arg of type.typeArgs) {
          this.validateTypeNode(arg);
        }
        break;
      }
      case "FunctionType": {
        for (const param of type.params) {
          this.validateTypeNode(param);
        }
        this.validateTypeNode(type.returnType);
        break;
      }
      case "UnionType":
        for (const t of type.types) {
          this.validateTypeNode(t);
        }
        break;
    }
  }

  private resolveTypeNode(type: TypeNode): LithoType {
    switch (type.kind) {
      case "SimpleType": {
        if (type.name === "Number") return { kind: "primitive", name: "Number" };
        if (type.name === "Text") return { kind: "primitive", name: "Text" };
        if (type.name === "Boolean") return { kind: "primitive", name: "Boolean" };
        if (type.name === "Void") return { kind: "primitive", name: "Void" };

        const struct = this.structs.get(type.name);
        if (struct) {
          const fields = new Map<string, LithoType>();
          for (const f of struct.fields) {
            fields.set(f.name, this.resolveTypeNode(f.type));
          }
          return { kind: "struct", name: type.name, fields };
        }

        const enumDef = this.enums.get(type.name);
        if (enumDef) {
          return { kind: "enum", name: enumDef.name, variants: enumDef.variants.map(v => v.name) };
        }

        return { kind: "named", name: type.name };
      }
      case "GenericType": {
        if (type.name === "List" && type.typeArgs.length === 1) {
          return { kind: "list", element: this.resolveTypeNode(type.typeArgs[0]) };
        }
        if (type.name === "Map" && type.typeArgs.length === 2) {
          return {
            kind: "map",
            key: this.resolveTypeNode(type.typeArgs[0]),
            value: this.resolveTypeNode(type.typeArgs[1]),
          };
        }
        if (type.name === "Set" && type.typeArgs.length === 1) {
          return { kind: "set", element: this.resolveTypeNode(type.typeArgs[0]) };
        }
        if (type.name === "Maybe" && type.typeArgs.length === 1) {
          return { kind: "maybe", inner: this.resolveTypeNode(type.typeArgs[0]) };
        }
        if (type.name === "Result" && type.typeArgs.length === 2) {
          return {
            kind: "result",
            ok: this.resolveTypeNode(type.typeArgs[0]),
            error: this.resolveTypeNode(type.typeArgs[1]),
          };
        }
        if (type.name === "Tuple" && type.typeArgs.length >= 2) {
          return {
            kind: "tuple",
            elements: type.typeArgs.map(a => this.resolveTypeNode(a)),
          };
        }
        return { kind: "named", name: type.name };
      }
      case "FunctionType": {
        return {
          kind: "function",
          params: type.params.map(p => this.resolveTypeNode(p)),
          returnType: this.resolveTypeNode(type.returnType),
        };
      }
      case "UnionType":
        return { kind: "unknown" };
    }
  }

  private isAssignable(source: LithoType, target: LithoType): boolean {
    // Unknown is always compatible (can't prove mismatch)
    if (source.kind === "unknown" || target.kind === "unknown") return true;

    // Same primitive
    if (source.kind === "primitive" && target.kind === "primitive") {
      return source.name === target.name;
    }

    // List<T> assignable to List<T>
    if (source.kind === "list" && target.kind === "list") {
      return this.isAssignable(source.element, target.element);
    }

    // Named types match by name
    if (source.kind === "named" && target.kind === "named") {
      return source.name === target.name;
    }
    if (source.kind === "named" || target.kind === "named") {
      return true; // can't prove mismatch for named types
    }

    // Struct assignability
    if (source.kind === "struct" && target.kind === "struct") {
      return source.name === target.name;
    }

    // Enum assignability
    if (source.kind === "enum" && target.kind === "enum") {
      return source.name === target.name;
    }

    // Tuple assignability (element-wise covariant)
    if (source.kind === "tuple" && target.kind === "tuple") {
      if (source.elements.length !== target.elements.length) return false;
      return source.elements.every((el, i) => this.isAssignable(el, target.elements[i]));
    }

    // Result/Maybe
    if (source.kind === "result" && target.kind === "result") {
      return this.isAssignable(source.ok, target.ok) &&
             this.isAssignable(source.error, target.error);
    }
    if (source.kind === "maybe" && target.kind === "maybe") {
      return this.isAssignable(source.inner, target.inner);
    }

    // Void is special — only Void is assignable to Void
    if (target.kind === "primitive" && target.name === "Void") {
      return source.kind === "primitive" && source.name === "Void";
    }

    // If both types are concrete but different kinds, check for known incompatibilities.
    // We only reject clear mismatches to avoid false positives with Result/Maybe wrapping.
    if (source.kind !== target.kind) {
      // A list is never a primitive and vice versa
      if (source.kind === "list" && target.kind === "primitive") return false;
      if (source.kind === "primitive" && target.kind === "list") return false;
      // A map is never a primitive and vice versa
      if (source.kind === "map" && target.kind === "primitive") return false;
      if (source.kind === "primitive" && target.kind === "map") return false;
      // A list is never a map and vice versa
      if (source.kind === "list" && target.kind === "map") return false;
      if (source.kind === "map" && target.kind === "list") return false;
      // A tuple is never a primitive and vice versa
      if (source.kind === "tuple" && target.kind === "primitive") return false;
      if (source.kind === "primitive" && target.kind === "tuple") return false;
    }

    return true; // default: don't block on uncertain types
  }

  private typeToString(type: LithoType): string {
    switch (type.kind) {
      case "primitive": return type.name;
      case "list": return `List<${this.typeToString(type.element)}>`;
      case "map": return `Map<${this.typeToString(type.key)}, ${this.typeToString(type.value)}>`;
      case "set": return `Set<${this.typeToString(type.element)}>`;
      case "maybe": return `Maybe<${this.typeToString(type.inner)}>`;
      case "result": return `Result<${this.typeToString(type.ok)}, ${this.typeToString(type.error)}>`;
      case "tuple": return `Tuple<${type.elements.map(e => this.typeToString(e)).join(", ")}>`;
      case "function": return `(${type.params.map(p => this.typeToString(p)).join(", ")}) -> ${this.typeToString(type.returnType)}`;
      case "struct": return type.name;
      case "enum": return type.name;
      case "named": return type.name;
      case "unknown": return "<unknown>";
    }
  }

  private checkMatchExhaustiveness(
    subjectType: LithoType,
    stmt: import("../parser/ast.js").MatchStatement,
  ): void {
    if (subjectType.kind !== "enum") return;

    const allVariants = new Set(subjectType.variants);
    // Check if any case has a wildcard or unguarded identifier pattern that isn't a variant name
    const hasCatchAll = stmt.cases.some(
      (c) =>
        !c.guard &&
        (c.pattern.kind === "WildcardPattern" ||
          (c.pattern.kind === "IdentifierPattern" &&
            !allVariants.has(c.pattern.name))),
    );
    if (hasCatchAll) return;

    // Collect covered variants from unguarded patterns
    const coveredVariants = new Set<string>();
    const collectVariantsFromPattern = (pattern: import("../parser/ast.js").Pattern): void => {
      if (pattern.kind === "ConstructorPattern") {
        coveredVariants.add(pattern.name);
      } else if (pattern.kind === "IdentifierPattern" && allVariants.has(pattern.name)) {
        coveredVariants.add(pattern.name);
      } else if (pattern.kind === "LiteralPattern" && typeof pattern.value === "string") {
        coveredVariants.add(pattern.value);
      } else if (pattern.kind === "OrPattern") {
        for (const sub of pattern.patterns) {
          collectVariantsFromPattern(sub);
        }
      }
    };
    for (const matchCase of stmt.cases) {
      if (matchCase.guard) continue; // guarded cases don't guarantee coverage
      collectVariantsFromPattern(matchCase.pattern);
    }

    const missingVariants = subjectType.variants.filter(
      (v) => !coveredVariants.has(v),
    );
    if (missingVariants.length > 0) {
      this.addError(
        `Non-exhaustive match on enum '${subjectType.name}': ` +
          `missing variant(s) ${missingVariants.map((v) => `'${v}'`).join(", ")}`,
        stmt.position,
      );
    }
  }

  /**
   * Infer the output type of a single pipeline step given the input type.
   * In a pipeline `a |> f(b)`, the source `a` is passed as the first argument
   * to `f`, so we resolve the return type based on knowledge of built-in
   * collection/prelude functions and user-defined functions.
   */
  private inferPipelineStep(
    inputType: LithoType,
    step: import("../parser/ast.js").PipelineStep,
    scope: Scope,
  ): LithoType {
    const calleeName =
      step.callee.kind === "IdentifierExpr" ? step.callee.name : null;

    if (!calleeName) return { kind: "unknown" };

    // Extract the element type from a list input (used by most collection fns)
    const elementType: LithoType =
      inputType.kind === "list" ? inputType.element : { kind: "unknown" };

    // Built-in collection functions that preserve the element type
    const preservesList = new Set([
      "filter", "take", "skip", "sort", "reverse", "unique", "collect",
    ]);
    if (preservesList.has(calleeName)) {
      if (inputType.kind === "list") {
        return inputType;
      }
      return { kind: "list", element: { kind: "unknown" } };
    }

    // map: List<T> -> List<U> where U is the lambda return type
    if (calleeName === "map") {
      if (step.args.length >= 1) {
        const lambdaArg = step.args[0].value;
        if (lambdaArg.kind === "LambdaExpr") {
          const lambdaScope = createScope(scope);
          // Bind lambda param to element type if available
          for (const param of lambdaArg.params) {
            const paramType = this.resolveTypeNode(param.type);
            lambdaScope.variables.set(
              param.name,
              paramType.kind === "unknown" ? elementType : paramType,
            );
          }
          const bodyType = this.inferExpression(lambdaArg.body, lambdaScope);
          return { kind: "list", element: bodyType };
        }
      }
      return { kind: "list", element: { kind: "unknown" } };
    }

    // flat_map: List<T> -> List<U> (flattened)
    if (calleeName === "flat_map") {
      if (step.args.length >= 1) {
        const lambdaArg = step.args[0].value;
        if (lambdaArg.kind === "LambdaExpr") {
          const lambdaScope = createScope(scope);
          for (const param of lambdaArg.params) {
            const paramType = this.resolveTypeNode(param.type);
            lambdaScope.variables.set(
              param.name,
              paramType.kind === "unknown" ? elementType : paramType,
            );
          }
          const bodyType = this.inferExpression(lambdaArg.body, lambdaScope);
          // flat_map unwraps one level of list
          if (bodyType.kind === "list") {
            return bodyType;
          }
          return { kind: "list", element: bodyType };
        }
      }
      return { kind: "list", element: { kind: "unknown" } };
    }

    // reduce: List<T> -> U (type of initial value)
    if (calleeName === "reduce") {
      // reduce(fn, initial) — initial is the second extra arg (index 1)
      if (step.args.length >= 2) {
        return this.inferExpression(step.args[1].value, scope);
      }
      return { kind: "unknown" };
    }

    // find, first, last: List<T> -> Maybe<T>
    if (calleeName === "find" || calleeName === "first" || calleeName === "last") {
      return { kind: "maybe", inner: elementType };
    }

    // count, length: List<T> -> Number
    if (calleeName === "count" || calleeName === "length") {
      return { kind: "primitive", name: "Number" };
    }

    // sum: List<Number> -> Number
    if (calleeName === "sum") {
      return { kind: "primitive", name: "Number" };
    }

    // min, max: List<Number> -> Maybe<Number>, or List<T> -> Maybe<T>
    if (calleeName === "min" || calleeName === "max") {
      return { kind: "maybe", inner: elementType };
    }

    // any_of, all_of, none_of: List<T> -> Boolean
    if (calleeName === "any_of" || calleeName === "all_of" || calleeName === "none_of") {
      return { kind: "primitive", name: "Boolean" };
    }

    // enumerate: List<T> -> List<Tuple<Number, T>>
    if (calleeName === "enumerate") {
      return {
        kind: "list",
        element: { kind: "tuple", elements: [{ kind: "primitive", name: "Number" }, elementType] },
      };
    }

    // zip: List<T> |> zip(List<U>) -> List<Tuple<T, U>>
    if (calleeName === "zip") {
      let secondElementType: LithoType = { kind: "unknown" };
      if (step.args.length >= 1) {
        const argType = this.inferExpression(step.args[0].value, scope);
        if (argType.kind === "list") {
          secondElementType = argType.element;
        }
      }
      return {
        kind: "list",
        element: { kind: "tuple", elements: [elementType, secondElementType] },
      };
    }

    // group: List<T> -> Map<K, List<T>>
    if (calleeName === "group") {
      return { kind: "map", key: { kind: "unknown" }, value: { kind: "list", element: elementType } };
    }

    // join: List<Text> -> Text
    if (calleeName === "join") {
      return { kind: "primitive", name: "Text" };
    }

    // String functions that return Text
    const textToText = new Set([
      "trim", "to_upper", "to_lower", "replace_text",
    ]);
    if (textToText.has(calleeName)) {
      return { kind: "primitive", name: "Text" };
    }

    // String functions that return Boolean
    if (calleeName === "starts_with" || calleeName === "ends_with") {
      return { kind: "primitive", name: "Boolean" };
    }

    // split: Text -> List<Text>
    if (calleeName === "split") {
      return { kind: "list", element: { kind: "primitive", name: "Text" } };
    }

    // to_text: any -> Text
    if (calleeName === "to_text") {
      return { kind: "primitive", name: "Text" };
    }

    // to_number: any -> Number
    if (calleeName === "to_number") {
      return { kind: "primitive", name: "Number" };
    }

    // print: any -> Void
    if (calleeName === "print") {
      return { kind: "primitive", name: "Void" };
    }

    // User-defined functions: look up return type
    // In a pipeline, the piped value is the first arg, so arg count is step.args.length + 1
    const func = this.functions.get(calleeName);
    if (func && func.returnType) {
      return this.resolveTypeNode(func.returnType);
    }

    return { kind: "unknown" };
  }

  private addError(message: string, position: Position): void {
    this.errors.push({ message, position });
  }
}
