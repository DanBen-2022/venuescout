import { currentUser, forbidden, json, sameOrigin, unauthorized } from "@/lib/auth";
import { domainFrom } from "@/lib/apollo";
import { listOf, norm, ts, TripleseatError } from "@/lib/tripleseat";

export const dynamic = "force-dynamic";

type Seg = { name?: string } | string | null | undefined;
type Account = { id: number | string; name?: string; websites?: { url?: string }[]; market_segment?: Seg };
const segName = (x: Seg) => (typeof x === "string" ? x : x?.name || "").trim();
const FREEMAIL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|msn|protonmail|comcast|verizon)\./i;
type Booking = {
  id: number | string; name?: string; status?: string; start_date?: string; end_date?: string;
  total_grand_total?: number | string; total_event_grand_total?: number | string;
  account?: { id?: number | string; name?: string }; location?: { name?: string };
  contact?: TsContact | null; secondary_contacts?: TsContact[] | null; market_segment?: Seg;
};
type TsContact = {
  id?: number | string; name?: string; first_name?: string; last_name?: string; title?: string; email?: string;
  email_addresses?: ({ address?: string; email?: string } | string)[]; phone_numbers?: ({ number?: string; phone_number?: string } | string)[];
};

// Tripleseat contacts come in a few shapes; take the first email and phone whatever the shape.
function person(c: TsContact | null | undefined) {
  if (!c || typeof c !== "object") return null;
  const name = (c.name || [c.first_name, c.last_name].filter(Boolean).join(" ")).trim();
  const em = c.email || (c.email_addresses || []).map((e) => (typeof e === "string" ? e : e.address || e.email || "")).find(Boolean) || "";
  const ph = (c.phone_numbers || []).map((p) => (typeof p === "string" ? p : p.number || p.phone_number || "")).find(Boolean) || "";
  if (!name && !em) return null;
  return { id: c.id != null ? String(c.id) : "", name, title: c.title || "", email: em, phone: ph };
}

const same = (a: string, b: string) => !!a && a === b;

// Has this company booked with the venue before? Finds Tripleseat accounts by company name, and by
// the website's domain (Tripleseat's search covers contact email addresses), then lists their bookings.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const { company, website, query: manual } = await req.json().catch(() => ({}));
  // A typed search (name, email or domain) takes over from the prospect's own name.
  const typed = String(manual || "").trim().slice(0, 120);
  const email = typed.includes("@") ? typed : "";
  const name = (typed && !email ? typed : String(company || "")).replace(/^(sample|example):\s*/i, "").trim();
  if (name.length < 2 && !email) return json({ error: "Add the company name first." }, 400);
  const key = norm(name);
  const domain = email ? email.split("@")[1].toLowerCase() : domainFrom(typed && /\.[a-z]{2,}$/i.test(typed) && !/\s/.test(typed) ? typed : website);
  try {
    const byName = name.length >= 2 && !(typed && domain && typed === domain)
      ? listOf<Account>(await ts("accounts/search.json", { query: name, order: "updated_at", sort_direction: "desc" }), "account") : [];
    const accounts = byName.filter((a) => same(norm(a.name), key) || (!!typed && byName.length <= 3) || (!!domain && (a.websites || []).some((w) => domainFrom(w.url) === domain)));
    if (email) {
      const byEmail = listOf<Account>(await ts("accounts/search.json", { query: email }), "account");
      for (const a of byEmail.slice(0, 5)) if (!accounts.some((x) => String(x.id) === String(a.id))) accounts.push(a);
    }
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
    console.log("tripleseat history", JSON.stringify({ q: name, domain, email: !!email, accountsRaw: byName.length, accountsMatched: accounts.length,
      accountKeys: Object.keys(byName[0] || {}).slice(0, 20), bookingsRaw: bookings.length, bookingKeys: Object.keys(bookings[0] || {}).slice(0, 30), mine: mine.length }));
    if (mine[0]?.contact) console.log("tripleseat contact keys", JSON.stringify(Object.keys(mine[0].contact)));
    // The people who booked: each booking's main contact and secondary contacts, newest booking first.
    const people = new Map<string, NonNullable<ReturnType<typeof person>>>();
    for (const b of [...mine].sort((a, b) => String(b.start_date || "").localeCompare(String(a.start_date || ""))))
      for (const c of [b.contact, ...(b.secondary_contacts || [])]) {
        const p = person(c); if (!p) continue;
        const k = (p.email || p.name).toLowerCase();
        if (!people.has(k)) people.set(k, p);
      }
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
      searched: { name, domain: domain || null, email: email || null },
      accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
      similar: byName.filter((a) => !ids.has(String(a.id))).slice(0, 5).map((a) => ({ id: a.id, name: a.name })),
      bookings: rows.slice(0, 25),
      contacts: [...people.values()].slice(0, 8),
      // What Tripleseat knows about the company, to fill the prospect: its website and market segment.
      details: (() => {
        const acct = accounts.find((a) => mine.some((b) => String(b.account?.id) === String(a.id))) || accounts[0];
        const site = (acct?.websites || []).map((w) => domainFrom(w.url)).find(Boolean) || "";
        const mailDomain = [...people.values()].map((p) => (p.email.split("@")[1] || "").toLowerCase()).find((d) => d && !FREEMAIL.test(d)) || "";
        const segment = segName(acct?.market_segment) || mine.map((b) => segName(b.market_segment)).find(Boolean) || "";
        return mine.length || acct ? { website: site || mailDomain, segment } : null;
      })(),
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
