import { currentUser, forbidden, json, sameOrigin, unauthorized } from "@/lib/auth";
import { apollo, apolloKey, ApolloError, domainFrom, EVENT_TITLES } from "@/lib/apollo";

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
  const k = await apolloKey();
  if (!k) return json({ error: "Apollo isn't connected yet. An Owner can connect it in Settings › Integrations." }, 400);
  const { company, website, domain: given, broad } = await req.json().catch(() => ({}));
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
    const base = { q_organization_domains_list: [domain], per_page: 25, page: 1 };
    let mode = "events";
    let r = broad
      ? { people: [] as Person[], total_entries: 0 }
      : await apollo<{ people?: Person[]; total_entries?: number }>(k.key, "mixed_people/api_search", { ...base, person_titles: EVENT_TITLES, include_similar_titles: true });
    if (!r.people?.length) {
      mode = "senior";
      r = await apollo(k.key, "mixed_people/api_search", { ...base, person_seniorities: ["c_suite", "vp", "head", "director"] });
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
      total: r.total_entries ?? people.length,
      people,
    });
  } catch (e) {
    if (e instanceof ApolloError) return json({ error: e.message }, e.status === 401 || e.status === 403 ? 400 : e.status);
    throw e;
  }
}
