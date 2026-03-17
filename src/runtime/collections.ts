/**
 * Litholang collection runtime.
 *
 * Provides pipeline-compatible collection functions.
 * Each function takes the collection as its first argument
 * so it works with the |> pipeline operator.
 */

export const COLLECTION_FUNCTIONS = new Set([
  "filter",
  "map",
  "reduce",
  "flat_map",
  "take",
  "skip",
  "sort",
  "group",
  "find",
  "any_of",
  "all_of",
  "none_of",
  "zip",
  "enumerate",
  "first",
  "last",
  "count",
  "sum",
  "collect",
  "reverse",
  "unique",
  "min",
  "max",
]);

export const COLLECTIONS_CODE = `// --- Litholang Collections ---
function filter<T>(items: T[], predicate: (item: T) => boolean): T[] {
  return items.filter(predicate);
}

function map<T, U>(items: T[], fn: (item: T) => U): U[] {
  return items.map(fn);
}

function reduce<T, U>(items: T[], fn: (acc: U, item: T) => U, initial: U): U {
  return items.reduce(fn, initial);
}

function flat_map<T, U>(items: T[], fn: (item: T) => U[]): U[] {
  return items.flatMap(fn);
}

function take<T>(items: T[], n: number): T[] {
  return items.slice(0, n);
}

function skip<T>(items: T[], n: number): T[] {
  return items.slice(n);
}

function sort<T>(items: T[], key?: (item: T) => number | string, descending?: boolean): T[] {
  const copy = [...items];
  if (!key) return copy.sort();
  return copy.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return descending ? -cmp : cmp;
  });
}

function group<T, K extends string | number>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of items) {
    const k = key(item);
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}

function find<T>(items: T[], predicate: (item: T) => boolean): T | null {
  return items.find(predicate) ?? null;
}

function any_of<T>(items: T[], predicate: (item: T) => boolean): boolean {
  return items.some(predicate);
}

function all_of<T>(items: T[], predicate: (item: T) => boolean): boolean {
  return items.every(predicate);
}

function none_of<T>(items: T[], predicate: (item: T) => boolean): boolean {
  return !items.some(predicate);
}

function zip<T, U>(a: T[], b: U[]): [T, U][] {
  const len = Math.min(a.length, b.length);
  const result: [T, U][] = [];
  for (let i = 0; i < len; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}

function enumerate<T>(items: T[]): [number, T][] {
  return items.map((item, i) => [i, item]);
}

function first<T>(items: T[]): T | null {
  return items.length > 0 ? items[0] : null;
}

function last<T>(items: T[]): T | null {
  return items.length > 0 ? items[items.length - 1] : null;
}

function count<T>(items: T[]): number {
  return items.length;
}

function sum(items: number[]): number;
function sum<T>(items: T[], key: (item: T) => number): number;
function sum<T>(items: T[], key?: (item: T) => number): number {
  if (key) return items.reduce((acc, item) => acc + key(item), 0);
  return (items as unknown as number[]).reduce((acc, n) => acc + n, 0);
}

function collect<T>(items: Iterable<T>): T[] {
  return Array.from(items);
}

function reverse<T>(items: T[]): T[] {
  return [...items].reverse();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function min(items: number[]): number | null;
function min<T>(items: T[], key: (item: T) => number): T | null;
function min<T>(items: T[], key?: (item: T) => number): T | number | null {
  if (items.length === 0) return null;
  if (key) return items.reduce((best, item) => key(item) < key(best) ? item : best);
  return Math.min(...(items as unknown as number[]));
}

function max(items: number[]): number | null;
function max<T>(items: T[], key: (item: T) => number): T | null;
function max<T>(items: T[], key?: (item: T) => number): T | number | null {
  if (items.length === 0) return null;
  if (key) return items.reduce((best, item) => key(item) > key(best) ? item : best);
  return Math.max(...(items as unknown as number[]));
}
`;
