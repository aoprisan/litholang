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

// --- Litholang Collections ---
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

type Thunk<T> = { done: false; fn: () => Thunk<T> } | { done: true; value: T };

function _trampoline_is_even(n: number): Thunk<boolean> {
  if ((n == 0)) {
    return { done: true, value: true };
  } else {
    return { done: false, fn: () => _trampoline_is_odd((n - 1)) };
  }
}

function _trampoline_is_odd(n: number): Thunk<boolean> {
  if ((n == 0)) {
    return { done: true, value: false };
  } else {
    return { done: false, fn: () => _trampoline_is_even((n - 1)) };
  }
}

function is_even(n: number): boolean {
  let __result: Thunk<boolean> = _trampoline_is_even(n);
  while (!__result.done) {
    __result = __result.fn();
  }
  return __result.value;
}

function is_odd(n: number): boolean {
  let __result: Thunk<boolean> = _trampoline_is_odd(n);
  while (!__result.done) {
    __result = __result.fn();
  }
  return __result.value;
}

export function factorial(n: number, acc: number): number {
  while (true) {
    if ((n <= 1)) {
      return acc;
    } else {
      if (true) {
        let __tailrec_n = (n - 1);
        let __tailrec_acc = (n * acc);
        n = __tailrec_n;
        acc = __tailrec_acc;
        continue;
      }
    }
  }
}

export function sum_list(items: number[], acc: number): number {
  while (true) {
    if (!((items.length > 0))) return acc;
    const head = first(items);
    const tail = skip(items, 1);
    if (true) {
      let __tailrec_items = tail;
      let __tailrec_acc = (acc + head);
      items = __tailrec_items;
      acc = __tailrec_acc;
      continue;
    }
  }
}

export function binary_search(items: number[], target: number, low: number, high: number): number | null {
  while (true) {
    if (!((low <= high))) return null;
    const mid = ((low + high) / 2);
    const value = items.at(mid);
    if (true && (() => { const v = value; return (v == target); })()) {
      const v = value;
      return mid;
    } else if (true && (() => { const v = value; return (v < target); })()) {
      const v = value;
      if (true) {
        let __tailrec_items = items;
        let __tailrec_target = target;
        let __tailrec_low = (mid + 1);
        let __tailrec_high = high;
        items = __tailrec_items;
        target = __tailrec_target;
        low = __tailrec_low;
        high = __tailrec_high;
        continue;
      }
    } else if (true) {
      if (true) {
        let __tailrec_items = items;
        let __tailrec_target = target;
        let __tailrec_low = low;
        let __tailrec_high = (mid - 1);
        items = __tailrec_items;
        target = __tailrec_target;
        low = __tailrec_low;
        high = __tailrec_high;
        continue;
      }
    }
  }
}
