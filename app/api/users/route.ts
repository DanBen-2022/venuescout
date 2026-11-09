import { randomBytes } from "crypto";
import { canManage, currentUser, forbidden, json, normEmail, sameOrigin, unauthorized } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!canManage(u)) return forbidden();
  const users = await q(`select id, email, name, role, active, created_at from users order by active desc, name`);
  const invites = await q(
    `select token, email, role, created_at from invites where used_at is null and created_at > now() - interval '14 days' order by created_at desc`
  );
  return json({ me: { id: u.id, role: u.role }, users, invites });
}

// Invite a teammate. Owners can invite any role; managers can invite managers and sales.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  if (!canManage(u)) return forbidden();
  const { email, role } = await req.json().catch(() => ({}));
  const e = normEmail(email);
  if (!e.includes("@")) return json({ error: "Enter a valid email." }, 400);
  if (!["owner", "manager", "sales"].includes(role)) return json({ error: "Pick a role." }, 400);
  if (role === "owner" && u.role !== "owner") return forbidden("Only an Owner can invite another Owner.");
  const token = randomBytes(24).toString("base64url");
  await q(`insert into invites (token, email, role, invited_by) values ($1, $2, $3, $4)`, [token, e, role, u.id]);
  return json({ ok: true, token });
}
