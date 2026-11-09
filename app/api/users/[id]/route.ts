import { canManage, currentUser, forbidden, json, sameOrigin, unauthorized } from "@/lib/auth";
import { q } from "@/lib/db";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// Change role or deactivate. Owners manage everyone; managers manage sales only.
export async function PATCH(req: Request, ctx: Ctx) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  if (!canManage(u)) return forbidden();
  const { id } = await ctx.params;
  const { role, active } = await req.json().catch(() => ({}));
  const t = (await q<{ id: string; role: string; name: string }>(`select id, role, name from users where id::text = $1`, [id]))[0];
  if (!t) return json({ error: "Not found" }, 404);
  if (t.id === u.id) return forbidden("You can't change your own access.");
  if (u.role === "manager" && (t.role !== "sales" || (role && role !== "sales"))) return forbidden("Managers can only manage Sales accounts.");
  if (role !== undefined && !["owner", "manager", "sales"].includes(role)) return json({ error: "Bad role" }, 400);
  if (t.role === "owner" && (role && role !== "owner" || active === false)) {
    const n = await q<{ n: number }>(`select count(*)::int as n from users where role = 'owner' and active`);
    if (n[0].n <= 1) return forbidden("Keep at least one active Owner.");
  }
  if (role && role !== t.role) {
    await q(`update users set role = $1 where id = $2`, [role, t.id]);
    await audit(u, "role", `Changed role for ${t.name}: ${t.role} → ${role}`);
  }
  if (typeof active === "boolean") {
    await q(`update users set active = $1 where id = $2`, [active, t.id]);
    await audit(u, "access", `${active ? "Turned access back on" : "Turned off access"} for ${t.name}`);
  }
  return json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  // Revoke a pending invite: id is the invite token.
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  if (!canManage(u)) return forbidden();
  const { id } = await ctx.params;
  const gone = await q<{ email: string }>(`delete from invites where token = $1 and used_at is null returning email`, [id]);
  if (gone[0]) await audit(u, "invite_revoke", `Cancelled the invite for ${gone[0].email}`);
  return json({ ok: true });
}
