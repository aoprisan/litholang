// Tail recursion analysis for LithoLang
//
// Validates that functions annotated with @tailrec have all recursive
// calls in tail position. Reports errors with positions when they don't.
//
// A call is in "tail position" when it is the last operation before
// returning — no further computation wraps or follows it.

import {
  FunctionDef,
  Statement,
  Expression,
  CallExpr,
  IfStatement,
  MatchStatement,
  Position,
} from "../parser/ast.js";

/** Prefix used for temporary variables in tail-recursion rewrites. */
export const TAILREC_PREFIX = "__tailrec_";

export interface TailRecError {
  message: string;
  position: Position;
}

export interface TailRecResult {
  isTailRecursive: boolean;
  errors: TailRecError[];
  recursiveCalls: CallExpr[];
  tailCalls: CallExpr[];
}

/**
 * Check whether a function annotated with @tailrec is actually tail-recursive.
 * Returns all recursive calls found and whether each is in tail position.
 */
export function checkTailRecursion(func: FunctionDef): TailRecResult {
  const hasTailRecAnnotation = func.annotations.some(
    (a) => a.name === "tailrec"
  );

  if (!hasTailRecAnnotation) {
    return { isTailRecursive: false, errors: [], recursiveCalls: [], tailCalls: [] };
  }

  const recursiveCalls: CallExpr[] = [];
  const tailCalls: CallExpr[] = [];
  const errors: TailRecError[] = [];

  // Walk the function body, tracking which calls are in tail position
  checkStatementsForTailCalls(func.body, func.name, true, recursiveCalls, tailCalls);

  // Every recursive call must be a tail call
  for (const call of recursiveCalls) {
    if (!tailCalls.includes(call)) {
      errors.push({
        message: `Recursive call to '${func.name}' is not in tail position`,
        position: call.position,
      });
    }
  }

  if (recursiveCalls.length === 0) {
    errors.push({
      message: `Function '${func.name}' is annotated with @tailrec but contains no recursive calls`,
      position: func.position,
    });
  }

  return {
    isTailRecursive: errors.length === 0,
    errors,
    recursiveCalls,
    tailCalls,
  };
}

/**
 * Walk a list of statements. Only the last statement can contain a tail call.
 */
function checkStatementsForTailCalls(
  statements: Statement[],
  funcName: string,
  isTailPosition: boolean,
  recursiveCalls: CallExpr[],
  tailCalls: CallExpr[]
): void {
  for (let i = 0; i < statements.length; i++) {
    const isLast = i === statements.length - 1;
    checkStatementForTailCalls(
      statements[i],
      funcName,
      isTailPosition && isLast,
      recursiveCalls,
      tailCalls
    );
  }
}

function checkStatementForTailCalls(
  stmt: Statement,
  funcName: string,
  isTailPosition: boolean,
  recursiveCalls: CallExpr[],
  tailCalls: CallExpr[]
): void {
  switch (stmt.kind) {
    case "ReturnStatement":
      // The returned expression is in tail position
      checkExprForTailCalls(stmt.value, funcName, isTailPosition, recursiveCalls, tailCalls);
      break;

    case "IfStatement":
      checkIfForTailCalls(stmt, funcName, isTailPosition, recursiveCalls, tailCalls);
      break;

    case "MatchStatement":
      checkMatchForTailCalls(stmt, funcName, isTailPosition, recursiveCalls, tailCalls);
      break;

    case "ExpressionStatement":
      // An expression statement in last position is a tail position
      checkExprForTailCalls(stmt.expr, funcName, isTailPosition, recursiveCalls, tailCalls);
      break;

    case "Assignment":
      // RHS of assignment is never in tail position
      checkExprForTailCalls(stmt.value, funcName, false, recursiveCalls, tailCalls);
      break;

    case "ForStatement":
      // Loop body is never in tail position (loop continues after)
      checkStatementsForTailCalls(stmt.body, funcName, false, recursiveCalls, tailCalls);
      break;

    case "CheckStatement":
      // check condition or return fallback — neither side is a tail call
      checkExprForTailCalls(stmt.condition, funcName, false, recursiveCalls, tailCalls);
      checkExprForTailCalls(stmt.fallback, funcName, false, recursiveCalls, tailCalls);
      break;
    case "RepeatStatement":
      checkExprForTailCalls(stmt.condition, funcName, false, recursiveCalls, tailCalls);
      for (const s of stmt.body) {
        checkStatementForTailCalls(s, funcName, false, recursiveCalls, tailCalls);
      }
      break;
  }
}

function checkIfForTailCalls(
  ifStmt: IfStatement,
  funcName: string,
  isTailPosition: boolean,
  recursiveCalls: CallExpr[],
  tailCalls: CallExpr[]
): void {
  // Condition is never in tail position
  checkExprForTailCalls(ifStmt.condition, funcName, false, recursiveCalls, tailCalls);

  // Then block: tail position propagates
  checkStatementsForTailCalls(ifStmt.thenBlock, funcName, isTailPosition, recursiveCalls, tailCalls);

  // Else-if clauses
  for (const clause of ifStmt.elseIfClauses) {
    checkExprForTailCalls(clause.condition, funcName, false, recursiveCalls, tailCalls);
    checkStatementsForTailCalls(clause.block, funcName, isTailPosition, recursiveCalls, tailCalls);
  }

  // Else block
  if (ifStmt.elseBlock) {
    checkStatementsForTailCalls(ifStmt.elseBlock, funcName, isTailPosition, recursiveCalls, tailCalls);
  }
}

function checkMatchForTailCalls(
  matchStmt: MatchStatement,
  funcName: string,
  isTailPosition: boolean,
  recursiveCalls: CallExpr[],
  tailCalls: CallExpr[]
): void {
  // Subject is never in tail position
  checkExprForTailCalls(matchStmt.subject, funcName, false, recursiveCalls, tailCalls);

  // Each case arm propagates tail position
  for (const matchCase of matchStmt.cases) {
    if (Array.isArray(matchCase.body)) {
      checkStatementsForTailCalls(matchCase.body, funcName, isTailPosition, recursiveCalls, tailCalls);
    } else {
      checkExprForTailCalls(matchCase.body, funcName, isTailPosition, recursiveCalls, tailCalls);
    }
  }
}

/**
 * Check an expression for recursive calls, tracking tail position.
 * Only a direct call `funcName(...)` at the top level of a tail-position
 * expression counts as a tail call.
 */
function checkExprForTailCalls(
  expr: Expression,
  funcName: string,
  isTailPosition: boolean,
  recursiveCalls: CallExpr[],
  tailCalls: CallExpr[]
): void {
  switch (expr.kind) {
    case "CallExpr": {
      const isRecursive = isRecursiveCall(expr, funcName);
      if (isRecursive) {
        recursiveCalls.push(expr);
        if (isTailPosition) {
          tailCalls.push(expr);
        }
      }
      // Check callee (not tail position — the call itself may be)
      checkExprForTailCalls(expr.callee, funcName, false, recursiveCalls, tailCalls);
      // Arguments are never in tail position
      for (const arg of expr.args) {
        checkExprForTailCalls(arg.value, funcName, false, recursiveCalls, tailCalls);
      }
      break;
    }

    case "BinaryExpr":
      // Both sides of binary expr are NOT in tail position
      checkExprForTailCalls(expr.left, funcName, false, recursiveCalls, tailCalls);
      checkExprForTailCalls(expr.right, funcName, false, recursiveCalls, tailCalls);
      break;

    case "UnaryExpr":
      checkExprForTailCalls(expr.operand, funcName, false, recursiveCalls, tailCalls);
      break;

    case "PipelineExpr":
      // In a pipeline, only the last step could be in tail position
      checkExprForTailCalls(expr.source, funcName, false, recursiveCalls, tailCalls);
      for (let i = 0; i < expr.steps.length; i++) {
        const step = expr.steps[i];
        checkExprForTailCalls(step.callee, funcName, false, recursiveCalls, tailCalls);
        for (const arg of step.args) {
          checkExprForTailCalls(arg.value, funcName, false, recursiveCalls, tailCalls);
        }
      }
      break;

    case "PropagateExpr":
      // expr? — the inner expression is NOT in tail position (propagation wraps it)
      checkExprForTailCalls(expr.expr, funcName, false, recursiveCalls, tailCalls);
      break;

    case "WithExpr":
      checkExprForTailCalls(expr.base, funcName, false, recursiveCalls, tailCalls);
      for (const update of expr.updates) {
        checkExprForTailCalls(update.value, funcName, false, recursiveCalls, tailCalls);
      }
      break;

    case "DotAccess":
      checkExprForTailCalls(expr.object, funcName, false, recursiveCalls, tailCalls);
      break;

    case "LambdaExpr":
      // Lambda body is a different scope — not tail position of outer function
      checkExprForTailCalls(expr.body, funcName, false, recursiveCalls, tailCalls);
      break;

    case "ListLiteral":
    case "TupleExpr":
      for (const el of expr.elements) {
        checkExprForTailCalls(el, funcName, false, recursiveCalls, tailCalls);
      }
      break;

    case "ConstructExpr":
      for (const field of expr.fields) {
        checkExprForTailCalls(field.value, funcName, false, recursiveCalls, tailCalls);
      }
      break;

    // Leaf nodes — no recursive calls possible
    case "NumberLiteral":
    case "TextLiteral":
    case "BooleanLiteral":
    case "IdentifierExpr":
    case "SelfExpr":
    case "ShortDotAccess":
      break;

    case "RangeExpr":
      checkExprForTailCalls(expr.start, funcName, false, recursiveCalls, tailCalls);
      checkExprForTailCalls(expr.end, funcName, false, recursiveCalls, tailCalls);
      break;
  }
}

function isRecursiveCall(call: CallExpr, funcName: string): boolean {
  return call.callee.kind === "IdentifierExpr" && call.callee.name === funcName;
}

/**
 * Transform a tail-recursive function AST into a loop-based version.
 * Returns a new FunctionDef with the recursive call replaced by
 * parameter reassignment + continue.
 *
 * The emitter uses this to generate:
 *   function factorial(n, acc) {
 *     while (true) {
 *       if (n <= 1) return acc;
 *       [n, acc] = [n - 1, n * acc];  // reassign params
 *       continue;
 *     }
 *   }
 */
export function transformTailRecToLoop(func: FunctionDef): FunctionDef {
  const paramNames = func.params.map((p) => p.name);
  const transformedBody = transformStatements(func.body, func.name, paramNames);

  return {
    ...func,
    // Mark that this function has been transformed (remove @tailrec, add internal marker)
    annotations: func.annotations.filter((a) => a.name !== "tailrec"),
    body: [
      {
        kind: "ForStatement" as const,
        variable: "__tailrec_loop",
        iterable: {
          kind: "BooleanLiteral" as const,
          value: true,
          position: func.position,
        },
        body: transformedBody,
        position: func.position,
      },
    ],
  };
}

function transformStatements(
  statements: Statement[],
  funcName: string,
  paramNames: string[]
): Statement[] {
  return statements.map((stmt, i) => {
    const isLast = i === statements.length - 1;
    return transformStatement(stmt, funcName, paramNames, isLast);
  });
}

function transformStatement(
  stmt: Statement,
  funcName: string,
  paramNames: string[],
  isTailPosition: boolean
): Statement {
  switch (stmt.kind) {
    case "ReturnStatement": {
      const replaced = tryReplaceTailCall(stmt.value, funcName, paramNames);
      if (replaced) return replaced;
      return stmt;
    }

    case "ExpressionStatement": {
      if (isTailPosition) {
        const replaced = tryReplaceTailCall(stmt.expr, funcName, paramNames);
        if (replaced) return replaced;
      }
      return stmt;
    }

    case "IfStatement":
      return {
        ...stmt,
        thenBlock: transformStatements(stmt.thenBlock, funcName, paramNames),
        elseIfClauses: stmt.elseIfClauses.map((c) => ({
          ...c,
          block: transformStatements(c.block, funcName, paramNames),
        })),
        elseBlock: stmt.elseBlock
          ? transformStatements(stmt.elseBlock, funcName, paramNames)
          : null,
      };

    case "MatchStatement":
      return {
        ...stmt,
        cases: stmt.cases.map((c) => ({
          ...c,
          body: Array.isArray(c.body)
            ? transformStatements(c.body, funcName, paramNames)
            : c.body,
        })),
      };

    default:
      return stmt;
  }
}

/**
 * If the expression is a recursive call, produce parameter reassignment
 * statements (one Assignment per parameter) followed by a continue sentinel.
 * Returns null if the expression is not a recursive call.
 */
function tryReplaceTailCall(
  expr: Expression,
  funcName: string,
  paramNames: string[]
): Statement | null {
  if (expr.kind !== "CallExpr") return null;
  if (!isRecursiveCall(expr, funcName)) return null;

  // Build a block: assign each param, then continue (represented as a
  // special ExpressionStatement with a __continue marker)
  const assignments: Statement[] = paramNames.map((name, i) => ({
    kind: "Assignment" as const,
    target: `${TAILREC_PREFIX}${name}`,
    value: expr.args[i]?.value ?? {
      kind: "IdentifierExpr" as const,
      name,
      position: expr.position,
    },
    position: expr.position,
  }));

  // After computing all new values, reassign the actual params
  const finalAssignments: Statement[] = paramNames.map((name) => ({
    kind: "Assignment" as const,
    target: name,
    isReassignment: true,
    value: {
      kind: "IdentifierExpr" as const,
      name: `${TAILREC_PREFIX}${name}`,
      position: expr.position,
    },
    position: expr.position,
  }));

  // Return an if-statement block that holds all the assignments
  // We use IfStatement with condition=true as a block container
  return {
    kind: "IfStatement" as const,
    condition: {
      kind: "BooleanLiteral" as const,
      value: true,
      position: expr.position,
    },
    thenBlock: [
      ...assignments,
      ...finalAssignments,
      // Continue sentinel — the emitter recognizes this
      {
        kind: "ExpressionStatement" as const,
        expr: {
          kind: "IdentifierExpr" as const,
          name: "__tailrec_continue",
          position: expr.position,
        },
        position: expr.position,
      },
    ],
    elseIfClauses: [],
    elseBlock: null,
    position: expr.position,
  };
}
