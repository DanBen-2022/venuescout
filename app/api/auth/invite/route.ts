import bcrypt from "bcryptjs";
import { forbidden, json, sameOrigin, startSession } from "@/lib/auth";
import { q } from "@/lib/db";

const VALID_DAYS = 14;

async function find(token: string) {
  const rows = await q<{ email: string; role: string }>(
    `select email, role from invites where token = $1 and used_at is null and created_at > now() - interval '${VALID_DAYS} days'`,
    [token]
  );
  return rows[0];
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const inv = await find(token);
  return inv ? json(inv) : json({ error: "This invite link has expired or was already used." }, 404);
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const { token, name, password } = await req.json().catch(() => ({}));
  const inv = await find(String(token || ""));
  if (!inv) return json({ error: "This invite link has expired or was already used." }, 404);
  if (String(password || "").length < 10) return json({ error: "Use a password of at least 10 characters." }, 400);
  if (!String(name || "").trim()) return json({ error: "Enter your name." }, 400);
  const hash = await bcrypt.hash(String(password), 12);
  const rows = await q<{ id: string }>(
    `insert into users (email, name, role, password_hash) values ($1, $2, $3, $4)
     on conflict (email) do update set name = excluded.name, role = excluded.role, password_hash = excluded.password_hash, active = true
     returning id`,
    [inv.email, String(name).trim(), inv.role, hash]
  );
  await q(`update invites set used_at = now() where token = $1`, [token]);
  await startSession(rows[0].id);
  return json({ ok: true });
}
