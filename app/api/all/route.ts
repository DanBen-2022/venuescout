import { currentUser, json, unauthorized, viewAsTarget } from "@/lib/auth";
import { canRead } from "@/lib/access";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const real = await currentUser();
  if (!real) return unauthorized();
  const target = await viewAsTarget(real);
  const u = target || real;
  const rows = await q<{ collection: string; id: string; data: Record<string, unknown> }>(
    `select collection, id, data from docs`
  );
  const out: Record<string, Record<string, unknown>> = { leads: {}, shows: {}, markets: {}, spend: {}, config: {} };
  for (const r of rows) {
    if (!out[r.collection] || !canRead(u, r.collection, r.id, r.data)) continue;
    out[r.collection][r.id] = r.data;
  }
  const team = await q(`select id, name, role from users where active order by name`);
  return json({ data: out, me: { id: u.id, name: u.name, email: u.email, role: u.role }, team,
    viewAs: target ? { by: { id: real.id, name: real.name, role: real.role } } : null });
}
