import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { q } from "@/lib/db";

export type Role = "owner" | "manager" | "sales";
export type User = { id: string; email: string; name: string; role: Role; active: boolean };

const COOKIE = "vs_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(s);
}

export async function startSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const rows = await q<User>(`select id, email, name, role, active from users where id = $1`, [payload.sub]);
    const u = rows[0];
    return u && u.active ? u : null;
  } catch {
    return null;
  }
}

export const canManage = (u: User) => u.role === "owner" || u.role === "manager";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export const unauthorized = () => json({ error: "Please sign in." }, 401);
export const forbidden = (msg = "Your role can't do that.") => json({ error: msg }, 403);

// Same-origin check for state-changing requests (cookie auth + lax cookie, belt and braces).
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const normEmail = (e: unknown) => String(e || "").trim().toLowerCase();

// "View as": an Owner (anyone) or Manager (Sales only) previews the app as a teammate.
// Read only: every write route refuses while the preview cookie is set.
const VIEW_AS = "vs_viewas";
export const canViewAs = (real: User, target: { id: string; role: Role; active: boolean }) =>
  target.active && target.id !== real.id && (real.role === "owner" || (real.role === "manager" && target.role === "sales"));

export async function viewAsTarget(real: User): Promise<User | null> {
  const id = (await cookies()).get(VIEW_AS)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await q<User>(`select id, email, name, role, active from users where id = $1`, [id]);
  return rows[0] && canViewAs(real, rows[0]) ? rows[0] : null;
}
export async function setViewAs(id: string | null) {
  const c = await cookies();
  if (!id) return c.delete(VIEW_AS);
  c.set(VIEW_AS, id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
}
// Returns a 403 response while previewing as someone else, otherwise null.
export async function previewBlock(real: User) {
  const t = await viewAsTarget(real);
  return t ? forbidden(`You're viewing as ${t.name}, so changes are off. Click Exit in the top bar to make changes.`) : null;
}
