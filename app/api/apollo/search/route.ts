import { currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized } from "@/lib/auth";
import { apollo, apolloKey, ApolloError, domainFrom, EVENT_TITLES } from "@/lib/apollo";

// Where the venue is: people based in the New York area come first.
const NY_AREA = ["New York", "New Jersey", "Connecticut"];
const SENIOR = ["c_suite", "vp", "head", "director"];

export const dynamic = "force-dynamic";

type Org = { id?: string; name?: string; primary_domain?: string; website_url?: string; logo_url?: string };
type Person = {
  id: string; first_name?: string; last_name?: string; last_name_obfuscated?: string; title?: string;
  has_email?: boolean; has_direct_phone?: boolean | string; organization?: { name?: string };
};

// Finds the people who run events at a company. Search itself uses no Apollo credits;
// looking up a company's domain by name uses 1 credit.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  const k = await apolloKey();
  if (!k) return json({ error: "Apollo isn't connected yet. An Owner can connect it in Settings › Integrations." }, 400);
  const { company, website, domain: given, broad, page: pg, near: nearIn, mode: modeIn, name: personName } = await req.json().catch(() => ({}));
  const who = String(personName || "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(100, Number(pg) || 1));
  const near = nearIn !== false;
  const name = String(company || "").replace(/^(sample|example):\s*/i, "").trim();
  try {
    let domain = domainFrom(given) || domainFrom(website);
    let org: Org | null = null;
    let candidates: Org[] = [];
    if (!domain) {
      if (!name) return json({ error: "Add the company name or website first." }, 400);
      const r = await apollo<{ organizations?: Org[]; accounts?: Org[] }>(k.key, "mixed_companies/search", { q_organization_name: name, per_page: 5 });
      candidates = [...(r.organizations || []), ...(r.accounts || [])].filter((o) => o.primary_domain);
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      org = candidates.find((o) => norm(o.name || "") === norm(name)) || candidates[0] || null;
      if (!org) return json({ error: `Apollo couldn't find "${name}". Add the company website and try again.` }, 404);
      domain = org.primary_domain!;
    }
    type Res = { people?: Person[]; total_entries?: number };
    const run = (mode: string, loc: boolean) =>
      apollo<Res>(k.key, "mixed_people/api_search", {
        q_organization_domains_list: [domain], per_page: 25, page,
        ...(mode === "name" ? { q_keywords: who } : mode === "events" ? { person_titles: EVENT_TITLES, include_similar_titles: true } : { person_seniorities: SENIOR }),
        ...(loc ? { person_locations: NY_AREA } : {}),
      });
    // Page 1 tries the narrowest useful search first, then widens: New York area, then everywhere,
    // then senior leaders. Later pages repeat exactly the search the first page settled on.
    const tries: [string, boolean][] = who ? [["name", false]] : page > 1
      ? [[modeIn === "senior" ? "senior" : "events", nearIn !== false]]
      : (broad ? [["senior", near], ["senior", false]] : [["events", near], ["events", false], ["senior", near], ["senior", false]]) as [string, boolean][];
    let r: Res = { people: [], total_entries: 0 };
    let mode = tries[0][0], usedNear = tries[0][1];
    const seen = new Set<string>();
    for (const [m, loc] of tries) {
      if (seen.has(m + loc)) continue;
      seen.add(m + loc);
      r = await run(m, loc);
      mode = m; usedNear = loc;
      if (r.people?.length) break;
    }
    const people = (r.people || []).map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name || p.last_name_obfuscated].filter(Boolean).join(" "),
      title: p.title || "",
      hasEmail: !!p.has_email,
      hasPhone: !!p.has_direct_phone && p.has_direct_phone !== "No",
    }));
    return json({
      domain,
      org: org ? { name: org.name, domain: org.primary_domain, website: org.website_url } : null,
      others: candidates.filter((o) => o !== org).slice(0, 4).map((o) => ({ name: o.name, domain: o.primary_domain })),
      mode,
      near: usedNear,
      widened: near && !usedNear,
      page,
      total: r.total_entries ?? people.length,
      people,
    });
  } catch (e) {
    if (e instanceof ApolloError) return json({ error: e.message }, e.status === 401 || e.status === 403 ? 400 : e.status);
    throw e;
  }
}
