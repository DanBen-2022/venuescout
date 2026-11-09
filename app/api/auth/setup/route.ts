import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { forbidden, json, normEmail, sameOrigin, startSession } from "@/lib/auth";
import { q } from "@/lib/db";

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET() {
  const n = await q<{ n: number }>(`select count(*)::int as n from users`);
  return json({ needsSetup: n[0].n === 0 });
}

// Creates the first Owner account. Only works while there are no users, and only with SETUP_TOKEN.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const { token, name, email, password } = await req.json().catch(() => ({}));
  const expected = process.env.SETUP_TOKEN || "";
  if (!expected || !eq(String(token || ""), expected)) return json({ error: "That setup code isn't right." }, 403);
  if (String(password || "").length < 10) return json({ error: "Use a password of at least 10 characters." }, 400);
  if (!normEmail(email).includes("@") || !String(name || "").trim()) return json({ error: "Enter your name and email." }, 400);
  const n = await q<{ n: number }>(`select count(*)::int as n from users`);
  if (n[0].n > 0) return json({ error: "Setup is already done. Sign in instead." }, 409);
  const hash = await bcrypt.hash(String(password), 12);
  const rows = await q<{ id: string }>(
    `insert into users (email, name, role, password_hash) values ($1, $2, 'owner', $3) returning id`,
    [normEmail(email), String(name).trim(), hash]
  );
  await startSession(rows[0].id);
  return json({ ok: true });
}
