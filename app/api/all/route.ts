import { currentUser, json, unauthorized } from "@/lib/auth";
import { canRead } from "@/lib/access";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  if (!u) return unauthorized();
  const rows = await q<{ collection: string; id: string; data: Record<string, unknown> }>(
    `select collection, id, data from docs`
  );
  const out: Record<string, Record<string, unknown>> = { leads: {}, shows: {}, markets: {}, spend: {}, config: {} };
  for (const r of rows) {
    if (!out[r.collection] || !canRead(u, r.collection, r.id, r.data)) continue;
    out[r.collection][r.id] = r.data;
  }
  const team = await q(`select id, name, role from users where active order by name`);
  return json({ data: out, me: { id: u.id, name: u.name, email: u.email, role: u.role }, team });
}
