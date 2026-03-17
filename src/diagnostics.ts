import { Position } from "./parser/ast.js";

export interface Diagnostic {
  message: string;
  position: Position;
}

/**
 * Formats a diagnostic with source context, showing the offending line
 * with a caret pointing to the error location.
 *
 * Example output:
 *   Error: Return type mismatch in 'process'
 *     --> file.litho:15:3
 *      |
 *   15 |   return count
 *      |          ^^^^^
 */
export function formatDiagnostic(
  source: string,
  filePath: string,
  diagnostic: Diagnostic,
): string {
  const lines = source.split("\n");
  const { line, column } = diagnostic.position;
  const lineIdx = line - 1;

  const parts: string[] = [];
  parts.push(`Error: ${diagnostic.message}`);
  parts.push(`  --> ${filePath}:${line}:${column}`);

  if (lineIdx >= 0 && lineIdx < lines.length) {
    const sourceLine = lines[lineIdx];
    const lineNum = String(line);
    const gutter = " ".repeat(lineNum.length + 1);

    parts.push(`${gutter}|`);
    parts.push(`${lineNum} | ${sourceLine}`);

    // Point to the approximate error location
    const pointer = " ".repeat(Math.max(0, column - 1)) + "^";
    parts.push(`${gutter}| ${pointer}`);
  }

  return parts.join("\n");
}

/**
 * Formats multiple diagnostics with source context.
 */
export function formatDiagnostics(
  source: string,
  filePath: string,
  diagnostics: Diagnostic[],
): string {
  return diagnostics
    .map(d => formatDiagnostic(source, filePath, d))
    .join("\n\n");
}
