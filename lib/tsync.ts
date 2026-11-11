import { q } from "@/lib/db";
import { getJson, setJson } from "@/lib/keys";
import { domainFrom } from "@/lib/apollo";
import { getToken, listOf, norm, ts } from "@/lib/tripleseat";
import { type Catalog, getCatalog } from "@/lib/venues";

// Which of our companies an inquiry belongs to, from its Tripleseat location name
// (e.g. "Hudson VU / Hudson Local" or "Green Fig"), using the venue list in Settings.
export function companyFor(c: Catalog, location: string) {
  const loc = norm(location);
  if (!loc) return "";
  const v = c.venues.find((x) => x.company && norm(x.name) && (loc.includes(norm(x.name)) || norm(x.name).includes(loc)));
  if (v) return v.company;
  if (/hudson|ink48/.test(loc)) return c.venues.find((x) => /hudson/i.test(x.company))?.company || "";
  if (/greenfig|yotel|socialdrink|greenroom/.test(loc)) return c.venues.find((x) => /fig/i.test(x.company))?.company || "";
  return "";
}

// Pulls new Tripleseat leads (website and email inquiries) into Prospects, at 9 AM and 3 PM New York time.
// Read-only on the Tripleseat side. A lead already in VenueScout (same Tripleseat id) is never added twice;
// an inquiry from a company that is already a prospect is added to that prospect's notes instead.

// Field names follow Tripleseat's lead API; several are optional, so each is read defensively.
type TsLead = {
  id: number | string; first_name?: string; last_name?: string; email_address?: string; email?: string; phone_number?: string; phone?: string;
  company?: string; company_name?: string; event_description?: string; event_name?: string; event_date?: string; start_time?: string;
  guest_count?: number | string; additional_information?: string; created_at?: string; converted_at?: string | null; lost_at?: string | null;
  status?: string; website?: string; deleted_at?: string | null; turned_down_at?: string | null; location?: { name?: string } | null; owned_by?: unknown; lead_source?: { name?: string } | string | null;
};
type SyncState = { since?: string; at?: string; imported?: number; updated?: number; error?: string | null; seen?: number };
export const getSyncState = async () => (await getJson<SyncState>("tripleseat_sync")) || {};

// Tripleseat sends dates like "11/19/2015 9:49 AM" (account time, New York) as well as ISO; make them comparable.
function iso(v: unknown): string {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const t = Date.parse(s); return isNaN(t) ? s : new Date(t).toISOString(); }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?/i);
  if (!m) return "";
  let h = Number(m[4] || 0);
  if (m[6]) h = (h % 12) + (/p/i.test(m[6]) ? 12 : 0);
  // New York is UTC-5 in winter and UTC-4 in summer; within an hour is close enough here.
  const t = Date.UTC(+m[3], +m[1] - 1, +m[2], h + 5, Number(m[5] || 0));
  return new Date(t).toISOString();
}
const day = (v: unknown) => iso(v).slice(0, 10);
const clean = (v: unknown, n = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const uid = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nameKey = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const FREEMAIL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|msn|protonmail|comcast|verizon)\./i;
function who(p: unknown) {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, string>;
  const name = (o.name || [o.first_name, o.last_name].filter(Boolean).join(" ")).trim();
  const email = String(o.email || o.email_address || "").toLowerCase();
  return name || email ? { name, email } : null;
}

// Newest first, up to `max` pages. Tripleseat may list oldest first; then read from the last page back.
async function newestLeads(since: string, maxPages = 6): Promise<TsLead[]> {
  const first = await ts("leads.json", { page: 1, order: "created_at", sort_direction: "desc" });
  const p1 = listOf<TsLead>(first, "lead");
  const total = Number((first as { total_pages?: number })?.total_pages || 1);
  const t = (x?: TsLead) => iso(x?.created_at);
  console.log("tripleseat sync shape", JSON.stringify({ n: p1.length, total, keys: Object.keys(p1[0] || {}).slice(0, 40), first: t(p1[0]), last: t(p1[p1.length - 1]) }));
  const oldestFirst = p1.length > 1 && t(p1[0]) < t(p1[p1.length - 1]);
  const out = [...p1];
  const pages = oldestFirst ? Array.from({ length: Math.min(maxPages, total - 1) }, (_, i) => total - i) : Array.from({ length: Math.min(maxPages, total) - 1 }, (_, i) => i + 2);
  for (const page of pages) {
    const got = listOf<TsLead>(await ts("leads.json", { page, order: "created_at", sort_direction: "desc" }), "lead");
    out.push(...got);
    if (!got.length || got.every((x) => t(x) && t(x) <= since)) break;
  }
  return out.filter((x) => t(x) > since).sort((a, b) => t(b).localeCompare(t(a)));
}

export async function syncTripleseatLeads(by: string) {
  const state = await getSyncState();
  if (!(await getToken())) return { skipped: "Tripleseat isn't connected." };
  // First run: only the last 3 days, so years of old inquiries don't flood Prospects.
  // A saved mark older than 30 days (or unreadable) restarts at 3 days, so a long gap never floods Prospects.
  const saved = iso(state.since);
  const since = saved && Date.now() - Date.parse(saved) < 30 * 864e5 ? saved : new Date(Date.now() - 3 * 864e5).toISOString();
  const res = { imported: 0, updated: 0, seen: 0, names: [] as string[] };
  try {
    const leads = await newestLeads(since);
    res.seen = leads.length;
    const docs = await q<{ id: string; data: Record<string, unknown> }>(`select id, data from docs where collection = 'leads'`);
    const byTs = new Set(docs.map((d) => String(d.data.tripleseatLeadId || "")).filter(Boolean));
    const byName = new Map(docs.map((d) => [norm(d.data.company), d] as const));
    const team = await q<{ id: string; name: string; email: string }>(`select id, name, email from users where active`).catch(() => []);
    const today = new Date().toISOString().slice(0, 10);
    const catalog = await getCatalog();
    let newest = since;
    for (const l of [...leads].reverse()) {
      const created = iso(l.created_at);
      if (created > newest) newest = created;
      const tsId = String(l.id);
      if (byTs.has(tsId) || l.lost_at || l.deleted_at || l.turned_down_at) continue;
      const person = clean([l.first_name, l.last_name].filter(Boolean).join(" "), 120);
      const email = clean(l.email_address || l.email, 160).toLowerCase();
      const company = clean(l.company || l.company_name, 120) || person;
      if (!company) continue;
      const dom = email.includes("@") && !FREEMAIL.test(email.split("@")[1]) ? domainFrom(email.split("@")[1]) : domainFrom(l.website);
      const src = typeof l.lead_source === "string" ? l.lead_source : l.lead_source?.name || "";
      const what = clean(l.event_description || l.event_name, 160);
      const line = `Tripleseat inquiry ${created.slice(0, 10)}${what ? `: ${what}` : ""}${l.event_date ? `, for ${day(l.event_date) || l.event_date}` : ""}${l.guest_count ? `, ${l.guest_count} guests` : ""}${l.location?.name ? ` at ${l.location.name}` : ""}${src ? ` (via ${src})` : ""}${l.converted_at ? ". Already turned into a booking in Tripleseat." : "."}` +
        (l.additional_information ? ` Note: ${clean(l.additional_information, 500)}` : "");
      const w = who(l.owned_by);
      const owner = w ? team.find((t) => (w.email && t.email.toLowerCase() === w.email) || (w.name && nameKey(t.name) === nameKey(w.name)))?.id : undefined;
      const contact = person || email ? { name: person, title: "", role: "Event coordinator", email, phone: clean(l.phone_number || l.phone, 40), linkedin: "", tripleseatId: tsId } : null;
      const tsLocation = clean(l.location?.name, 80);
      const tsCompany = companyFor(catalog, tsLocation);
      const have = byName.get(norm(company));
      if (have) {
        // Already a prospect: note the new inquiry and add the person if they're new.
        const d = have.data as Record<string, unknown> & { contacts?: { email?: string; name?: string }[]; notes?: string };
        const contacts = [...(d.contacts || [])];
        if (contact && !contacts.some((c) => (email && String(c.email || "").toLowerCase() === email) || (person && nameKey(c.name) === nameKey(person)))) contacts.push(contact);
        const data = { ...d, contacts, tripleseatLeadId: tsId, ...(tsLocation ? { tsLocation } : {}), ...(tsCompany ? { tsCompany } : {}), notes: [line, d.notes].filter(Boolean).join("\n\n").slice(0, 8000), ...(d.owner || !owner ? {} : { owner }), updatedAt: new Date().toISOString() };
        await q(`update docs set data = $2, updated_at = now() where collection = 'leads' and id = $1`, [have.id, JSON.parse(JSON.stringify(data))]);
        res.updated++;
      } else {
        const lead = {
          company, website: dom || "", industry: "", market: "", type: "", status: "New", statusDates: { New: today },
          channel: "Inbound", source: "Tripleseat lead", eventName: what, eventDate: day(l.event_date),
          attendance: Number(l.guest_count) || undefined, notes: line, contacts: contact ? [contact] : [], tripleseatLeadId: tsId,
          ...(tsLocation ? { tsLocation } : {}), ...(tsCompany ? { tsCompany } : {}),
          ...(owner ? { owner } : {}), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        const id = uid();
        await q(`insert into docs (collection, id, data, updated_at) values ('leads', $1, $2, now()) on conflict do nothing`, [id, JSON.parse(JSON.stringify(lead))]);
        byName.set(norm(company), { id, data: lead });
        res.imported++;
        res.names.push(company);
      }
      byTs.add(tsId);
    }
    await setJson("tripleseat_sync", { since: newest, at: new Date().toISOString(), imported: res.imported, updated: res.updated, seen: res.seen, error: null, by });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Sync failed.";
    await setJson("tripleseat_sync", { ...state, at: new Date().toISOString(), error: msg, by });
    return { ...res, error: msg };
  }
}
