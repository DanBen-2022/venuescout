import { canManage, currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized, viewAsTarget } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MARKET_IDS } from "@/lib/scout";
import { type Competitor, getCompetitors, saveCompetitors } from "@/lib/competitors";

export const dynamic = "force-dynamic";

// Competitor venues and the clients they name. Everyone can read; Owners and Managers edit.
export async function GET() {
  const real = await currentUser();
  if (!real) return unauthorized();
  const u = (await viewAsTarget(real)) || real;
  return json({ competitors: await getCompetitors(), canEdit: canManage(u) });
}

const s = (v: unknown, n: number) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, n);
const num = (v: unknown) => { const x = Math.round(Number(v)); return isFinite(x) && x > 0 ? Math.min(x, 100000) : 0; };
const link = (v: unknown) => { const x = s(v, 400); return /^https?:\/\/\S+$/i.test(x) ? x : ""; };
const id = (v: unknown, p: string, i: number) => s(v, 40).toLowerCase().replace(/[^a-z0-9-]/g, "") || `${p}${Date.now().toString(36)}${i}`;

export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (!canManage(u)) return forbidden("Only Owners and Managers can change competitor venues.");
  const b = await req.json().catch(() => ({}));
  const raw: unknown[] = Array.isArray(b.competitors) ? b.competitors.slice(0, 30) : [];
  const list: Competitor[] = raw.map((x, i) => {
    const v = (x || {}) as Record<string, unknown>;
    const clients = (Array.isArray(v.clients) ? v.clients.slice(0, 300) : []).map((y: unknown, j: number) => {
      const k = (y || {}) as Record<string, unknown>;
      return { id: id(k.id, "k", j), name: s(k.name, 120), event: s(k.event, 120), guests: num(k.guests),
        market: MARKET_IDS.includes(String(k.market)) ? String(k.market) : "", source: link(k.source) };
    }).filter((k: { name: string }) => k.name);
    return { id: id(v.id, "c", i), name: s(v.name, 120), website: link(v.website), address: s(v.address, 200), capacity: s(v.capacity, 200),
      notes: s(v.notes, 600), on: v.on === true, clients };
  }).filter((v) => v.name);
  await saveCompetitors(list);
  await audit(u, "competitors_saved", `Saved competitor venues: ${list.map((v) => `${v.name} (${v.clients.length} clients${v.on ? "" : ", off"})`).join(", ") || "none"}`.slice(0, 900));
  return json({ ok: true, competitors: list });
}
