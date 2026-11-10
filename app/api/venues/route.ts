import { canManage, currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized, viewAsTarget } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { MARKET_IDS } from "@/lib/scout";
import { type Catalog, getCatalog, MEDIA_KINDS, saveCatalog, SOCIAL_KEYS, VENUE_STYLES } from "@/lib/venues";

export const dynamic = "force-dynamic";

// The venues and seasonal offers Scout pitches. Everyone can read them; Owners and Managers edit.
export async function GET() {
  const real = await currentUser();
  if (!real) return unauthorized();
  const u = (await viewAsTarget(real)) || real;
  return json({ catalog: await getCatalog(), canEdit: canManage(u), styles: VENUE_STYLES, mediaKinds: MEDIA_KINDS });
}

const s = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);
const num = (v: unknown) => { const x = Math.round(Number(v)); return isFinite(x) && x > 0 ? Math.min(x, 5000) : 0; };
const slug = (v: unknown, i: number) => s(v, 40).toLowerCase().replace(/[^a-z0-9-]/g, "") || `v${Date.now().toString(36)}${i}`;
// Links must be http(s); a bare handle like @hudsonvu is kept as typed.
const link = (v: unknown) => { const x = s(v, 400); return /^https?:\/\/\S+$/i.test(x) ? x : ""; };
const handle = (v: unknown) => { const x = s(v, 200); return /^(https?:\/\/\S+|@?[\w.\-]{1,60})$/i.test(x) ? x : ""; };
const mmdd = (v: unknown) => { const m = s(v, 5).match(/^(\d\d)-(\d\d)$/); return m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31 ? m[0] : ""; };

export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (!canManage(u)) return forbidden("Only Owners and Managers can change venues and offers.");
  const b = (await req.json().catch(() => ({}))) as Partial<Catalog>;
  if (!Array.isArray(b.venues) || !Array.isArray(b.offers)) return json({ error: "Nothing to save." }, 400);
  const venues = b.venues.slice(0, 20).map((v, i) => ({
    id: slug(v.id, i), name: s(v.name, 80), company: s(v.company, 80), location: s(v.location, 120),
    style: VENUE_STYLES.includes(String(v.style)) ? String(v.style) : "Upscale",
    seated: num(v.seated), standing: num(v.standing), about: s(v.about, 1200), spaces: s(v.spaces, 1200), packages: s(v.packages, 2000),
    bestFor: (Array.isArray(v.bestFor) ? v.bestFor : []).map(String).filter((m) => MARKET_IDS.includes(m)), contact: s(v.contact, 160),
    social: Object.fromEntries(SOCIAL_KEYS.map((k) => [k, k === "website" ? link(v.social?.[k]) || (s(v.social?.[k], 200) ? "https://" + s(v.social?.[k], 200).replace(/^\/+/, "") : "") : handle(v.social?.[k])])) as Catalog["venues"][number]["social"],
    media: (Array.isArray(v.media) ? v.media : []).slice(0, 30).map((m, j) => ({
      id: s(m.id, 40) || `m${Date.now().toString(36)}${i}${j}`, title: s(m.title, 120), url: link(m.url),
      kind: MEDIA_KINDS.includes(String(m.kind)) ? String(m.kind) : "Other", note: s(m.note, 300), clientReady: !!m.clientReady,
    })).filter((m) => m.title && m.url),
    pastEvents: (Array.isArray(v.pastEvents) ? v.pastEvents : []).slice(0, 60).map((e, j) => ({
      id: s(e.id, 40) || `e${Date.now().toString(36)}${i}${j}`, client: s(e.client, 100), who: s(e.who, 100), canName: !!e.canName,
      title: s(e.title, 120), month: /^\d{4}-\d{2}$/.test(s(e.month, 7)) ? s(e.month, 7) : "", guests: num(e.guests),
      market: MARKET_IDS.includes(String(e.market)) ? String(e.market) : "", space: s(e.space, 80), link: link(e.link),
    })).filter((e) => e.title && (e.client || e.who)),
  })).filter((v) => v.name);
  const ids = new Set(venues.map((v) => v.id));
  const offers = b.offers.slice(0, 40).map((o, i) => ({
    id: s(o.id, 40) || `o${Date.now().toString(36)}${i}`, title: s(o.title, 100),
    venueIds: (Array.isArray(o.venueIds) ? o.venueIds : []).map(String).filter((x) => ids.has(x)),
    from: mmdd(o.from), to: mmdd(o.to), details: s(o.details, 1000), priceFrom: s(o.priceFrom, 60), on: !!o.on,
  })).filter((o) => o.title);
  const bad = offers.find((o) => o.on && (!o.from || !o.to || !o.venueIds.length));
  if (bad) return json({ error: `"${bad.title}" needs dates and at least one venue before it can be on.` }, 400);
  await saveCatalog({ venues, offers });
  await audit(u, "venues_saved", `Updated venues and offers: ${venues.length} venues, ${offers.filter((o) => o.on).length} offers on`);
  return json({ ok: true, catalog: { venues, offers } });
}
