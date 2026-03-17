/**
 * Litholang runtime prelude.
 *
 * Provides core built-in functions that are always available in Litho programs.
 * The emitter prepends this code when any prelude function is referenced.
 */

export const PRELUDE_FUNCTIONS = new Set([
  "print",
  "to_text",
  "to_number",
  "length",
  "range",
  "ok",
  "err",
  "some",
  "panic",
]);

export const PRELUDE_CODE = `// --- Litholang Prelude ---
function print(...args: unknown[]): void {
  console.log(...args);
}

function to_text(value: unknown): string {
  return String(value);
}

function to_number(value: unknown): number {
  return Number(value);
}

function length(value: string | unknown[]): number {
  return value.length;
}

function range(start: number, end?: number): number[] {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  const result: number[] = [];
  for (let i = start; i < end; i++) {
    result.push(i);
  }
  return result;
}

function panic(message: string): never {
  throw new Error(message);
}
`;
