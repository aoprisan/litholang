function __propagateResult<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!result.ok) throw { __lithoPropagate: true, value: result };
  return result.value;
}

import { Hash } from "crypto";

export interface NewUser {
  email: string;
  password: string;
  name: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  created_at: Timestamp;
}

export interface HttpRequest {
  body: string;
}

export interface HttpResponse {
  status: number;
  body: string;
}

export function handle_register(request: HttpRequest): { ok: true; value: HttpResponse } | { ok: false; error: string } {
  try {
    const body = __propagateResult(request.parse_json());
    if (!((body.email != ""))) return { ok: false, error: "Invalid email" };
    if (!((body.password.length >= 8))) return { ok: false, error: "Password too short" };
    const hashed = Hash.password(body.password);
    const user = __propagateResult(db.users.insert(/* email: */ body.email, /* password_hash: */ hashed, /* name: */ body.name, /* created_at: */ now()));
    const response = { status: 201, body: user.id };
    return { ok: true, value: response };
  } catch (__e: unknown) {
    if (__e && typeof __e === "object" && "__lithoPropagate" in __e) return (__e as { value: unknown }).value;
    throw __e;
  }
}

export function find_user_by_email(email: string): UserResponse | null {
  const user = db.users.find_one(/* email: */ email);
  if (!((user != null))) return null;
  const result = { id: user.id, email: user.email, name: user.name, created_at: user.created_at };
  return result;
}

export function list_users(page: number = 1, page_size: number = 20): UserResponse[] {
  const offset = ((page - 1) * page_size);
  return collect(take(skip(db.users.find_all(), offset), page_size));
}
