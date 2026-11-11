import type Anthropic from "@anthropic-ai/sdk";
import { q } from "@/lib/db";
import { apollo, apolloKey, domainFrom, marketFor, type Org } from "@/lib/apollo";
import { claudeClient, claudeKey } from "@/lib/claude";
import { MARKET_IDS, MARKET_NAMES, SCOUT_MODEL } from "@/lib/scout";

// Research for Tripleseat inquiries, right after the sync files them:
//  1. Apollo company profile from the contact's work email domain (about 1 credit).
//  2. Apollo person match by email: title and LinkedIn profile link (about 1 credit).
//  3. A small Claude model picks the market and writes a short brief for the rep.
// Personal emails (gmail etc.) skip Apollo. Each prospect is researched once (flag tsEnriched).

const FREEMAIL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|aol|msn|protonmail|comcast|verizon|mac)\./i;
type Contact = { name?: string; title?: string; email?: string; linkedin?: string; apolloId?: string; [k: string]: unknown };
type Lead = Record<string, unknown> & { company?: string; website?: string; market?: string; industry?: string; notes?: string; contacts?: Contact[]; eventName?: string; eventDate?: string; attendance?: number; tsLocation?: string; org?: Record<string, unknown> };
type Person = { title?: string; headline?: string; linkedin_url?: string; seniority?: string; departments?: string[]; city?: string; state?: string; employment_history?: { organization_name?: string; title?: string; current?: boolean }[] };

const BRIEF_TOOL: Anthropic.Tool = {
  name: "save_brief",
  description: "Save the market and brief. Call exactly once.",
  input_schema: {
    type: "object", additionalProperties: false, required: ["market", "brief", "isIndividual"],
    properties: {
      market: { type: "string", enum: MARKET_IDS, description: "The market this inquiry belongs to." },
      isIndividual: { type: "boolean", description: "True when this is a private person's own celebration rather than a business or organization." },
      brief: { type: "string", description: "Two or three plain sentences for the sales rep: who the company is, who the contact is and their role, and what to lead with. Only facts given; say when something is unknown." },
    },
  },
};

const clean = (v: unknown, n = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export async function enrichTripleseatLeads(limit = 15) {
  const docs = await q<{ id: string; data: Lead }>(
    `select id, data from docs where collection = 'leads' and data ? 'tripleseatLeadId' and not (data ? 'tsEnriched') order by updated_at desc limit $1`, [limit]);
  if (!docs.length) return { enriched: 0 };
  const [ak, ck] = await Promise.all([apolloKey(), claudeKey()]);
  const claude = ck ? claudeClient(ck.key) : null;
  let enriched = 0;
  for (const { id, data } of docs) {
    const l: Lead = JSON.parse(JSON.stringify(data));
    const c = (l.contacts || [])[0] || {};
    const email = String(c.email || "").toLowerCase();
    const dom = email.includes("@") && !FREEMAIL.test(email.split("@")[1]) ? domainFrom(email.split("@")[1]) : domainFrom(l.website);
    let org: Org | undefined, person: Person | undefined;
    if (ak && dom) {
      try { org = (await apollo<{ organization?: Org }>(ak.key, "organizations/enrich", { domain: dom }, "GET")).organization; } catch { /* a bonus */ }
      if (email && !FREEMAIL.test(email.split("@")[1] || "")) {
        try { person = (await apollo<{ person?: Person & { id?: string } }>(ak.key, "people/match", { email, reveal_personal_emails: false })).person; } catch { /* a bonus */ }
      }
    }
    if (org?.name) {
      const hq = [org.city, org.state, org.country && org.country !== "United States" ? org.country : ""].filter(Boolean).join(", ");
      l.org = { name: org.name, domain: org.primary_domain || dom, industry: org.industry ? org.industry.replace(/\b\w/g, (x) => x.toUpperCase()) : "", keywords: (org.keywords || []).slice(0, 10),
        employees: org.estimated_num_employees || null, revenue: org.annual_revenue || null, revenueText: org.annual_revenue_printed || "", description: clean(org.short_description, 600),
        hq, founded: org.founded_year || null, linkedin: org.linkedin_url || "", phone: org.phone || "", logo: org.logo_url || "", market: marketFor(org), at: new Date().toISOString().slice(0, 10) };
      if (!l.industry && l.org.industry) l.industry = String(l.org.industry);
      if (!l.website && (org.website_url || org.primary_domain)) l.website = org.website_url || "https://" + org.primary_domain;
    }
    if (person && l.contacts?.[0]) {
      const k = l.contacts[0];
      if (!k.title && person.title) k.title = clean(person.title, 120);
      if (!k.linkedin && person.linkedin_url) k.linkedin = person.linkedin_url;
    }
    let brief = "", market = "";
    if (claude) {
      const facts = [
        `Inquiry: ${clean(l.eventName, 160) || "event"}${l.eventDate ? ` on ${l.eventDate}` : ""}${l.attendance ? `, ${l.attendance} guests` : ""}${l.tsLocation ? `, asked for ${l.tsLocation}` : ""}.`,
        `Company as typed: ${clean(l.company, 120)}. Contact: ${clean(c.name, 80) || "unknown"}${email ? ` <${email}>` : ""}.`,
        org?.name ? `Apollo company: ${org.name}; ${org.industry || "industry unknown"}; ${org.estimated_num_employees || "?"} staff; HQ ${[org.city, org.state].filter(Boolean).join(", ") || "?"}; ${clean(org.short_description, 400)}` : "No company profile found.",
        person ? `Apollo person: ${person.title || "title unknown"}${person.seniority ? `, ${person.seniority}` : ""}${person.headline ? `; headline: ${clean(person.headline, 160)}` : ""}${person.city ? `; ${person.city}` : ""}.` : "No person profile found.",
        `Inquiry note: ${clean(String(l.notes || "").split("\n\n")[0], 600)}`,
      ].join("\n");
      try {
        const r = await claude.messages.create({
          model: SCOUT_MODEL, max_tokens: 600,
          system: "You help the sales team of New York private event venues triage new inquiries. Pick the market from the list and write a short, factual brief. Never invent facts.\nMarkets:\n" + MARKET_IDS.map((m) => `- ${m}: ${MARKET_NAMES[m]}`).join("\n") + "\nA private person's own birthday, wedding or family party is 'social'.",
          tools: [BRIEF_TOOL], tool_choice: { type: "tool", name: "save_brief" },
          messages: [{ role: "user", content: facts }],
        });
        const out = r.content.find((b) => b.type === "tool_use")?.input as { market?: string; brief?: string } | undefined;
        if (out?.market && MARKET_IDS.includes(out.market)) market = out.market;
        brief = clean(out?.brief, 700);
      } catch { /* a bonus */ }
    }
    if (!l.market && (market || (l.org?.market as string))) l.market = market || String(l.org?.market);
    if (brief) { l.tsBrief = brief; l.notes = [`About: ${brief}`, l.notes].filter(Boolean).join("\n\n").slice(0, 8000); }
    l.tsEnriched = { at: new Date().toISOString(), org: !!org?.name, person: !!person, market: l.market || "" };
    l.updatedAt = new Date().toISOString();
    await q(`update docs set data = $2, updated_at = now() where collection = 'leads' and id = $1`, [id, JSON.parse(JSON.stringify(l))]);
    enriched++;
  }
  return { enriched };
}
