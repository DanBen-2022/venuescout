import { currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized } from "@/lib/auth";
import { apollo, apolloKey, ApolloError, domainFrom } from "@/lib/apollo";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Org = {
  id?: string; name?: string; primary_domain?: string; website_url?: string; linkedin_url?: string; phone?: string;
  industry?: string; industries?: string[]; secondary_industries?: string[]; keywords?: string[];
  estimated_num_employees?: number; annual_revenue?: number; annual_revenue_printed?: string;
  short_description?: string; city?: string; state?: string; country?: string; founded_year?: number; logo_url?: string;
};

// Apollo's industry names (LinkedIn's list) mapped to VenueScout's markets. First match wins,
// so the more specific groups (event agencies, PR) come before the broad ones (media, tech).
const INDUSTRY_MARKETS: [RegExp, string][] = [
  [/events? services|public relations|event planning/i, "planners"],
  [/banking|financial services|investment|capital markets|venture capital|private equity|insurance|real estate|wealth|fintech/i, "finance"],
  [/apparel|fashion|luxury|jewelry|cosmetics|beauty|wine (and|&) spirits|textiles/i, "luxury"],
  [/law practice|legal|management consulting|accounting|professional services|business consulting/i, "professional"],
  [/pharmaceutical|biotechnology|medical|hospital|health|life sciences|veterinary/i, "pharma"],
  [/non-?profit|philanthropy|fund-?raising|civic|museums|religious|think tanks/i, "nonprofit"],
  [/entertainment|music|motion pictures|film|sports|hospitality|restaurants|leisure|performing arts|gambling|casinos|recreation|food (and|&) beverages/i, "entertainment"],
  [/information technology|software|internet|computer|telecommunications|media|publishing|newspapers|broadcast|marketing|advertising|e-?learning|semiconductors|online/i, "tech"],
];

function marketFor(o: Org): string {
  const all = [o.industry, ...(o.industries || []), ...(o.secondary_industries || [])].filter(Boolean).join(" | ");
  for (const [re, id] of INDUSTRY_MARKETS) if (re.test(o.industry || "")) return id;
  for (const [re, id] of INDUSTRY_MARKETS) if (re.test(all)) return id;
  return "";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Looks up a company in Apollo: industry, size, revenue, HQ, description, keywords.
// Uses about 1 Apollo credit, or 2 when there's no website and Apollo has to find it by name first.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  const k = await apolloKey();
  if (!k) return json({ error: "Apollo isn't connected yet. An Owner can connect it in Settings › Integrations." }, 400);
  const { company, website, leadId, bulk } = await req.json().catch(() => ({}));
  const name = String(company || "").replace(/^(sample|example):\s*/i, "").trim();
  try {
    let domain = domainFrom(website);
    let others: Org[] = [];
    if (!domain) {
      if (name.length < 2 || /^new prospect$/i.test(name)) return json({ error: "Add the company name or website first." }, 400);
      const r = await apollo<{ organizations?: Org[]; accounts?: Org[] }>(k.key, "mixed_companies/search", { q_organization_name: name, per_page: 5 });
      const cands = [...(r.organizations || []), ...(r.accounts || [])].filter((o) => o.primary_domain);
      const key = norm(name);
      // In a bulk run only take a close name match, so a prospect is never filled with another company's details.
      const close = (o: Org) => { const n = norm(o.name || ""); return n === key || (n.length > 3 && key.length > 3 && (n.startsWith(key) || key.startsWith(n))); };
      const hit = cands.find((o) => norm(o.name || "") === key) || cands.find(close) || (bulk ? undefined : cands[0]);
      if (!hit) return json({ error: `Apollo couldn't find "${name}". Add the company website and try again.`, notFound: true }, 404);
      domain = hit.primary_domain!;
      others = cands.filter((o) => o !== hit).slice(0, 4);
    }
    const r = await apollo<{ organization?: Org }>(k.key, "organizations/enrich", { domain }, "GET");
    const o = r.organization;
    if (!o || !o.name) return json({ error: `Apollo has no company profile for ${domain}.`, notFound: true }, 404);
    if (!bulk) await audit(u, "apollo_company", `Looked up ${o.name} in Apollo`, { collection: leadId ? "leads" : undefined, docId: leadId ? String(leadId) : undefined });
    const hq = [o.city, o.state, o.country && o.country !== "United States" ? o.country : ""].filter(Boolean).join(", ");
    return json({
      name: o.name,
      domain: o.primary_domain || domain,
      website: o.website_url || (o.primary_domain ? "https://" + o.primary_domain : ""),
      industry: o.industry ? o.industry.replace(/\b\w/g, (c) => c.toUpperCase()) : "",
      keywords: (o.keywords || []).slice(0, 10),
      employees: o.estimated_num_employees || null,
      revenue: o.annual_revenue || null,
      revenueText: o.annual_revenue_printed || "",
      description: (o.short_description || "").slice(0, 600),
      hq,
      founded: o.founded_year || null,
      linkedin: o.linkedin_url || "",
      phone: o.phone || "",
      logo: o.logo_url || "",
      market: marketFor(o),
      others: others.map((x) => ({ name: x.name, domain: x.primary_domain })),
    });
  } catch (e) {
    if (e instanceof ApolloError) return json({ error: e.message }, e.status === 401 || e.status === 403 ? 400 : e.status);
    return json({ error: "Couldn't reach Apollo." }, 502);
  }
}
