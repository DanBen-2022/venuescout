import { currentUser, forbidden, json, sameOrigin, unauthorized } from "@/lib/auth";
import { domainFrom } from "@/lib/apollo";
import { listOf, norm, ts, TripleseatError } from "@/lib/tripleseat";

export const dynamic = "force-dynamic";

type Account = { id: number | string; name?: string; websites?: { url?: string }[] };
type Booking = {
  id: number | string; name?: string; status?: string; start_date?: string; end_date?: string;
  total_grand_total?: number | string; total_event_grand_total?: number | string;
  account?: { id?: number | string; name?: string }; location?: { name?: string };
};

const same = (a: string, b: string) => !!a && a === b;

// Has this company booked with the venue before? Finds Tripleseat accounts by company name, and by
// the website's domain (Tripleseat's search covers contact email addresses), then lists their bookings.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const { company, website } = await req.json().catch(() => ({}));
  const name = String(company || "").replace(/^(sample|example):\s*/i, "").trim();
  if (name.length < 2) return json({ error: "Add the company name first." }, 400);
  const key = norm(name), domain = domainFrom(website);
  try {
    const byName = listOf<Account>(await ts("accounts/search.json", { query: name, order: "updated_at", sort_direction: "desc" }), "account");
    const accounts = byName.filter((a) => same(norm(a.name), key) || (!!domain && (a.websites || []).some((w) => domainFrom(w.url) === domain)));
    if (domain) {
      // Accounts whose contacts use @domain email addresses, or whose website is the domain.
      const byDomain = listOf<Account>(await ts("accounts/search.json", { query: domain, order: "updated_at", sort_direction: "desc" }), "account");
      for (const a of byDomain.slice(0, 5)) if (!accounts.some((x) => String(x.id) === String(a.id))) accounts.push(a);
    }
    const ids = new Set(accounts.map((a) => String(a.id)));
    const bookings: Booking[] = [];
    const seen = new Set<string>();
    // Bookings search covers booking and event names, so search the prospect's name and each matched account's name.
    const queries = [name, ...accounts.map((a) => String(a.name || "")).filter((n) => n && norm(n) !== key)].slice(0, 4);
    for (const query of queries) {
      for (let page = 1; page <= 3; page++) {
        const body = await ts("bookings/search.json", { query, show_financial: true, order: "created_at", sort_direction: "desc", page });
        const list = listOf<Booking>(body, "booking");
        for (const b of list) if (!seen.has(String(b.id))) { seen.add(String(b.id)); bookings.push(b); }
        const pages = Number((body as { total_pages?: number }).total_pages || 1);
        if (page >= pages || !list.length) break;
      }
    }
    const mine = bookings.filter((b) => (b.account?.id != null && ids.has(String(b.account.id))) || same(norm(b.account?.name), key));
    const today = new Date().toISOString().slice(0, 10);
    const rows = mine
      .map((b) => ({
        id: b.id, name: b.name || "", status: String(b.status || "").toUpperCase(), start: b.start_date || "",
        total: Number(b.total_grand_total ?? b.total_event_grand_total ?? 0) || 0, location: b.location?.name || "",
        account: b.account?.name || "",
      }))
      .sort((a, b) => (b.start || "").localeCompare(a.start || ""));
    const won = rows.filter((r) => r.status === "DEFINITE" || r.status === "CLOSED");
    const held = won.filter((r) => r.start && r.start <= today);
    return json({
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      bookings: rows.slice(0, 25),
      summary: {
        pastClient: held.length > 0,
        held: held.length,
        upcoming: won.length - held.length,
        lost: rows.filter((r) => r.status === "LOST").length,
        open: rows.filter((r) => r.status === "PROSPECT" || r.status === "TENTATIVE").length,
        lastHeld: held[0]?.start || null,
        revenue: held.reduce((s, r) => s + r.total, 0),
      },
    });
  } catch (e) {
    if (e instanceof TripleseatError) return json({ error: e.message }, e.status === 429 ? 429 : 400);
    throw e;
  }
}
