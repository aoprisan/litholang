function __propagateResult<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!result.ok) throw { __lithoPropagate: true, value: result };
  return result.value;
}

export enum Priority {
  Critical,
  High,
  Medium,
  Low,
}

export interface Task {
  id: string;
  title: string;
  priority: Priority;
  assignee: string | null;
  estimate: number;
}

export function validate_task(title: string, estimate: number): { ok: true; value: Task } | { ok: false; error: string } {
  if (!((title != ""))) return { ok: false, error: "Title cannot be empty" };
  if (!((estimate > 0))) return { ok: false, error: "Estimate must be positive" };
  const task = { id: generate_id(), title: title, priority: Medium, assignee: null, estimate: estimate };
  return { ok: true, value: task };
}

export function priority_label(p: Priority): string {
  if (true) {
    const Critical = p;
    return "CRITICAL";
  } else if (true) {
    const High = p;
    return "HIGH";
  } else if (true) {
    const Medium = p;
    return "MEDIUM";
  } else if (true) {
    const Low = p;
    return "LOW";
  }
}

export function estimate_category(task: Task): string {
  if (true && (() => { const hours = task.estimate; return (hours >= 40); })()) {
    const hours = task.estimate;
    return "epic";
  } else if (true && (() => { const hours = task.estimate; return (hours >= 8); })()) {
    const hours = task.estimate;
    return "story";
  } else if (true && (() => { const hours = task.estimate; return (hours >= 1); })()) {
    const hours = task.estimate;
    return "task";
  } else if (true) {
    return "subtask";
  }
}

export function find_assignee(task: Task): string {
  if (true && (() => { const name = task.assignee; return (name != ""); })()) {
    const name = task.assignee;
    return name;
  } else if (true) {
    return "unassigned";
  }
}

export function create_task(title: string, estimate: number = 4): { ok: true; value: Task } | { ok: false; error: string } {
  if (!((title != ""))) return { ok: false, error: "Title is required" };
  const task = { id: generate_id(), title: title, priority: Medium, assignee: null, estimate: estimate };
  return { ok: true, value: task };
}

export function assign_and_schedule(title: string, assignee: string): { ok: true; value: Task } | { ok: false; error: string } {
  try {
    const task = __propagateResult(create_task(title));
    const updated = { ...task, assignee: assignee };
    if (!((updated.estimate <= 80))) return { ok: false, error: "Task estimate exceeds sprint capacity" };
    return { ok: true, value: updated };
  } catch (__e: unknown) {
    if (__e && typeof __e === "object" && "__lithoPropagate" in __e) return (__e as { value: unknown }).value;
    throw __e;
  }
}

export function max_concurrent(p: Priority): number {
  if (true) {
    const Critical = p;
    return 1;
  } else if (true) {
    const High = p;
    return 3;
  } else if (true) {
    const Medium = p;
    return 5;
  } else if (true) {
    const Low = p;
    return 10;
  }
}
