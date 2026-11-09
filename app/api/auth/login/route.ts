import bcrypt from "bcryptjs";
import { json, normEmail, sameOrigin, startSession, forbidden } from "@/lib/auth";
import { q } from "@/lib/db";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const { email, password } = await req.json().catch(() => ({}));
  const rows = await q<{ id: string; password_hash: string | null; active: boolean }>(
    `select id, password_hash, active from users where email = $1`,
    [normEmail(email)]
  );
  const u = rows[0];
  const ok = u && u.active && u.password_hash && (await bcrypt.compare(String(password || ""), u.password_hash));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: "That email and password don't match." }, 401);
  }
  await startSession(u.id);
  return json({ ok: true });
}
