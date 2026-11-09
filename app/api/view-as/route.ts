import { canManage, canViewAs, currentUser, forbidden, json, sameOrigin, setViewAs, unauthorized, type User } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  if (!canManage(u)) return forbidden();
  const { userId } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || ""))) return json({ error: "Pick a teammate." }, 400);
  const rows = await q<User>(`select id, email, name, role, active from users where id = $1`, [userId]);
  if (!rows[0] || !canViewAs(u, rows[0])) return forbidden(u.role === "manager" ? "Managers can view as Sales teammates only." : "You can't view as this person.");
  await setViewAs(rows[0].id);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  await setViewAs(null);
  return json({ ok: true });
}
