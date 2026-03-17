// --- Litholang Prelude ---
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

export type Shape = { kind: "Circle"; radius: number } | { kind: "Rectangle"; width: number; height: number } | { kind: "Point" };
function Circle(radius: number): Shape { return { kind: "Circle", radius }; }
function Rectangle(width: number, height: number): Shape { return { kind: "Rectangle", width, height }; }
function Point(): Shape { return { kind: "Point" }; }

export function area(s: Shape): number {
  if (s.kind === "Circle") {
    const r = s;
    ((r * r) * 3.14159);
  } else if (s.kind === "Rectangle") {
    const dims = s;
    dims;
  } else if (true) {
    const Point = s;
    0;
  }
}

export function classify_status(status: string): string {
  if ((status === "active" || status === "pending")) {
    "open";
  } else if ((status === "closed" || status === "archived")) {
    "done";
  } else if (true) {
    "unknown";
  }
}

export function first_ten(): number[] {
  return range(1, 10);
}

export function countdown(n: number): number {
  const result = n;
  while ((result > 0)) {
    const result = (result - 1);
  }
  return result;
}
