// Trampoline transformation for mutual recursion in LithoLang
//
// Functions annotated with @trampoline are transformed so that instead
// of directly calling each other (which would overflow the stack),
// they return thunks that a driver loop bounces until a final value.
//
// Generated TypeScript pattern:
//
//   type Thunk<T> = { done: false; fn: () => Thunk<T> } | { done: true; value: T };
//
//   function _isEven(n: number): Thunk<boolean> {
//     if (n === 0) return { done: true, value: true };
//     return { done: false, fn: () => _isOdd(n - 1) };
//   }
//
//   function isEven(n: number): boolean {
//     let result: Thunk<boolean> = _isEven(n);
//     while (!result.done) result = result.fn();
//     return result.value;
//   }

import {
  FunctionDef,
  Statement,
  Expression,
  CallExpr,
  Program,
  Position,
} from "../parser/ast.js";

export interface TrampolineGroup {
  functions: FunctionDef[];
  errors: TrampolineError[];
}

export interface TrampolineError {
  message: string;
  position: Position;
}

/**
 * Find groups of mutually recursive functions annotated with @trampoline.
 * Functions in the same @trampoline group must reference each other's names
 * in the annotation value, e.g.:
 *
 *   @trampoline "isEven, isOdd"
 *   define isEven(n: Number) -> Boolean as ... end
 */
export function findTrampolineGroups(program: Program): TrampolineGroup[] {
  const trampolineFunctions = program.declarations.filter(
    (d): d is FunctionDef =>
      d.kind === "FunctionDef" &&
      d.annotations.some((a) => a.name === "trampoline")
  );

  if (trampolineFunctions.length === 0) return [];

  // Group by annotation value (functions that name each other)
  const groupMap = new Map<string, FunctionDef[]>();
  const errors: TrampolineError[] = [];

  for (const func of trampolineFunctions) {
    const annotation = func.annotations.find((a) => a.name === "trampoline")!;
    const groupNames = annotation.value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .sort()
      .join(",");

    if (!groupMap.has(groupNames)) {
      groupMap.set(groupNames, []);
    }
    groupMap.get(groupNames)!.push(func);
  }

  const groups: TrampolineGroup[] = [];

  for (const [groupKey, funcs] of groupMap) {
    const expectedNames = groupKey.split(",");
    const actualNames = funcs.map((f) => f.name).sort();

    // Validate that all named functions exist in the group
    for (const name of expectedNames) {
      if (!actualNames.includes(name)) {
        errors.push({
          message: `@trampoline group references '${name}' but no function with that name has a matching @trampoline annotation`,
          position: funcs[0].position,
        });
      }
    }

    groups.push({ functions: funcs, errors });
  }

  return groups;
}

/**
 * Check that mutual calls between @trampoline functions are in tail position.
 */
export function validateTrampolineGroup(group: TrampolineGroup): TrampolineError[] {
  const errors: TrampolineError[] = [];
  const groupNames = new Set(group.functions.map((f) => f.name));

  for (const func of group.functions) {
    const nonTailCalls = findNonTailMutualCalls(func.body, groupNames, true);
    for (const call of nonTailCalls) {
      const calleeName =
        call.callee.kind === "IdentifierExpr" ? call.callee.name : "<unknown>";
      errors.push({
        message: `Call to '${calleeName}' in @trampoline function '${func.name}' is not in tail position`,
        position: call.position,
      });
    }
  }

  return errors;
}

function findNonTailMutualCalls(
  statements: Statement[],
  groupNames: Set<string>,
  isTailPosition: boolean
): CallExpr[] {
  const nonTailCalls: CallExpr[] = [];

  for (let i = 0; i < statements.length; i++) {
    const isLast = i === statements.length - 1;
    findNonTailInStatement(
      statements[i],
      groupNames,
      isTailPosition && isLast,
      nonTailCalls
    );
  }

  return nonTailCalls;
}

function findNonTailInStatement(
  stmt: Statement,
  groupNames: Set<string>,
  isTailPosition: boolean,
  nonTailCalls: CallExpr[]
): void {
  switch (stmt.kind) {
    case "ReturnStatement":
      findNonTailInExpr(stmt.value, groupNames, isTailPosition, nonTailCalls);
      break;

    case "ExpressionStatement":
      findNonTailInExpr(stmt.expr, groupNames, isTailPosition, nonTailCalls);
      break;

    case "IfStatement":
      findNonTailInExpr(stmt.condition, groupNames, false, nonTailCalls);
      findNonTailMutualCalls(stmt.thenBlock, groupNames, isTailPosition).forEach(
        (c) => nonTailCalls.push(c)
      );
      for (const clause of stmt.elseIfClauses) {
        findNonTailInExpr(clause.condition, groupNames, false, nonTailCalls);
        findNonTailMutualCalls(clause.block, groupNames, isTailPosition).forEach(
          (c) => nonTailCalls.push(c)
        );
      }
      if (stmt.elseBlock) {
        findNonTailMutualCalls(stmt.elseBlock, groupNames, isTailPosition).forEach(
          (c) => nonTailCalls.push(c)
        );
      }
      break;

    case "MatchStatement":
      findNonTailInExpr(stmt.subject, groupNames, false, nonTailCalls);
      for (const matchCase of stmt.cases) {
        if (Array.isArray(matchCase.body)) {
          findNonTailMutualCalls(matchCase.body, groupNames, isTailPosition).forEach(
            (c) => nonTailCalls.push(c)
          );
        } else {
          findNonTailInExpr(matchCase.body, groupNames, isTailPosition, nonTailCalls);
        }
      }
      break;

    case "Assignment":
      findNonTailInExpr(stmt.value, groupNames, false, nonTailCalls);
      break;

    case "ForStatement":
      findNonTailMutualCalls(stmt.body, groupNames, false).forEach(
        (c) => nonTailCalls.push(c)
      );
      break;

    case "CheckStatement":
      findNonTailInExpr(stmt.condition, groupNames, false, nonTailCalls);
      findNonTailInExpr(stmt.fallback, groupNames, false, nonTailCalls);
      break;
    case "RepeatStatement":
      findNonTailInExpr(stmt.condition, groupNames, false, nonTailCalls);
      for (const s of stmt.body) findNonTailInStatement(s, groupNames, false, nonTailCalls);
      break;
  }
}

function findNonTailInExpr(
  expr: Expression,
  groupNames: Set<string>,
  isTailPosition: boolean,
  nonTailCalls: CallExpr[]
): void {
  switch (expr.kind) {
    case "CallExpr": {
      const isMutualCall =
        expr.callee.kind === "IdentifierExpr" &&
        groupNames.has(expr.callee.name);
      if (isMutualCall && !isTailPosition) {
        nonTailCalls.push(expr);
      }
      // Check arguments (never tail position)
      for (const arg of expr.args) {
        findNonTailInExpr(arg.value, groupNames, false, nonTailCalls);
      }
      break;
    }
    case "BinaryExpr":
      findNonTailInExpr(expr.left, groupNames, false, nonTailCalls);
      findNonTailInExpr(expr.right, groupNames, false, nonTailCalls);
      break;
    case "UnaryExpr":
      findNonTailInExpr(expr.operand, groupNames, false, nonTailCalls);
      break;
    case "PipelineExpr":
      findNonTailInExpr(expr.source, groupNames, false, nonTailCalls);
      for (const step of expr.steps) {
        findNonTailInExpr(step.callee, groupNames, false, nonTailCalls);
        for (const arg of step.args) {
          findNonTailInExpr(arg.value, groupNames, false, nonTailCalls);
        }
      }
      break;
    case "PropagateExpr":
      findNonTailInExpr(expr.expr, groupNames, false, nonTailCalls);
      break;
    case "WithExpr":
      findNonTailInExpr(expr.base, groupNames, false, nonTailCalls);
      for (const update of expr.updates) {
        findNonTailInExpr(update.value, groupNames, false, nonTailCalls);
      }
      break;
    case "DotAccess":
      findNonTailInExpr(expr.object, groupNames, false, nonTailCalls);
      break;
    case "LambdaExpr":
      findNonTailInExpr(expr.body, groupNames, false, nonTailCalls);
      break;
    case "ListLiteral":
    case "TupleExpr":
      for (const el of expr.elements) {
        findNonTailInExpr(el, groupNames, false, nonTailCalls);
      }
      break;
    case "ConstructExpr":
      for (const field of expr.fields) {
        findNonTailInExpr(field.value, groupNames, false, nonTailCalls);
      }
      break;
    // Leaf nodes
    case "NumberLiteral":
    case "TextLiteral":
    case "BooleanLiteral":
    case "IdentifierExpr":
    case "SelfExpr":
    case "ShortDotAccess":
      break;

    case "RangeExpr":
      findNonTailInExpr(expr.start, groupNames, false, nonTailCalls);
      findNonTailInExpr(expr.end, groupNames, false, nonTailCalls);
      break;
  }
}

/**
 * Transform a group of @trampoline functions into thunk-returning versions
 * plus wrapper functions that run the trampoline loop.
 *
 * For each function in the group:
 * 1. An internal `_funcName` that returns thunks instead of making direct calls
 * 2. A public `funcName` wrapper that drives the trampoline
 */
export function transformTrampolineGroup(group: TrampolineGroup): {
  internalFunctions: FunctionDef[];
  wrapperFunctions: FunctionDef[];
} {
  const groupNames = new Set(group.functions.map((f) => f.name));
  const internalFunctions: FunctionDef[] = [];
  const wrapperFunctions: FunctionDef[] = [];

  for (const func of group.functions) {
    // Internal function: replace mutual calls with thunk returns
    const internalBody = transformBodyToThunks(func.body, groupNames);
    internalFunctions.push({
      ...func,
      name: `_trampoline_${func.name}`,
      body: internalBody,
      annotations: func.annotations.filter((a) => a.name !== "trampoline"),
    });

    // Wrapper function: calls internal, bounces until done
    wrapperFunctions.push({
      ...func,
      annotations: func.annotations.filter((a) => a.name !== "trampoline"),
      body: [
        // result = _trampoline_funcName(args...)
        {
          kind: "Assignment" as const,
          target: "__trampoline_result",
          value: {
            kind: "CallExpr" as const,
            callee: {
              kind: "IdentifierExpr" as const,
              name: `_trampoline_${func.name}`,
              position: func.position,
            },
            args: func.params.map((p) => ({
              value: {
                kind: "IdentifierExpr" as const,
                name: p.name,
                position: func.position,
              } as Expression,
            })),
            position: func.position,
          },
          position: func.position,
        },
        // while (!result.done) result = result.fn()
        {
          kind: "ForStatement" as const,
          variable: "__trampoline_loop",
          iterable: {
            kind: "BooleanLiteral" as const,
            value: true,
            position: func.position,
          },
          body: [
            {
              kind: "ReturnStatement" as const,
              value: {
                kind: "IdentifierExpr" as const,
                name: "__trampoline_result",
                position: func.position,
              },
              position: func.position,
            },
          ],
          position: func.position,
        },
      ],
    });
  }

  return { internalFunctions, wrapperFunctions };
}

function transformBodyToThunks(
  statements: Statement[],
  groupNames: Set<string>
): Statement[] {
  return statements.map((stmt) => transformStatementToThunks(stmt, groupNames));
}

function transformStatementToThunks(
  stmt: Statement,
  groupNames: Set<string>
): Statement {
  switch (stmt.kind) {
    case "ReturnStatement": {
      const transformed = transformExprToThunk(stmt.value, groupNames);
      if (transformed) {
        return { ...stmt, value: transformed };
      }
      // Wrap non-call returns in { done: true, value: ... }
      return stmt;
    }

    case "IfStatement":
      return {
        ...stmt,
        thenBlock: transformBodyToThunks(stmt.thenBlock, groupNames),
        elseIfClauses: stmt.elseIfClauses.map((c) => ({
          ...c,
          block: transformBodyToThunks(c.block, groupNames),
        })),
        elseBlock: stmt.elseBlock
          ? transformBodyToThunks(stmt.elseBlock, groupNames)
          : null,
      };

    case "MatchStatement":
      return {
        ...stmt,
        cases: stmt.cases.map((c) => ({
          ...c,
          body: Array.isArray(c.body)
            ? transformBodyToThunks(c.body, groupNames)
            : c.body,
        })),
      };

    default:
      return stmt;
  }
}

function transformExprToThunk(
  expr: Expression,
  groupNames: Set<string>
): Expression | null {
  if (expr.kind !== "CallExpr") return null;
  if (expr.callee.kind !== "IdentifierExpr") return null;
  if (!groupNames.has(expr.callee.name)) return null;

  // Replace `mutualFunc(args)` with a thunk marker
  // The emitter will generate: { done: false, fn: () => _trampoline_mutualFunc(args) }
  return {
    kind: "ConstructExpr" as const,
    typeName: "__TrampolineThunk",
    fields: [
      {
        name: "fn",
        value: {
          kind: "LambdaExpr" as const,
          params: [],
          body: {
            kind: "CallExpr" as const,
            callee: {
              kind: "IdentifierExpr" as const,
              name: `_trampoline_${expr.callee.name}`,
              position: expr.position,
            },
            args: expr.args,
            position: expr.position,
          },
          position: expr.position,
        },
      },
    ],
    position: expr.position,
  };
}
