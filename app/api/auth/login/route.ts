import bcrypt from "bcryptjs";
import { json, normEmail, sameOrigin, startSession, forbidden } from "@/lib/auth";
import { q } from "@/lib/db";
import { audit, ipOf } from "@/lib/audit";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const { email, password } = await req.json().catch(() => ({}));
  const rows = await q<{ id: string; name: string; password_hash: string | null; active: boolean }>(
    `select id, name, password_hash, active from users where email = $1`,
    [normEmail(email)]
  );
  const u = rows[0];
  const ok = u && u.active && u.password_hash && (await bcrypt.compare(String(password || ""), u.password_hash));
  if (!ok) {
    await audit(u ? { id: u.id, name: u.name } : null, "login_failed", `Failed sign-in for ${normEmail(email).slice(0, 120) || "blank email"}${u && !u.active ? " (access is off)" : ""}`, { ip: ipOf(req) });
    await new Promise((r) => setTimeout(r, 400));
    return json({ error: "That email and password don't match." }, 401);
  }
  await startSession(u.id);
  await audit({ id: u.id, name: u.name }, "login", "Signed in", { ip: ipOf(req) });
  return json({ ok: true });
}
