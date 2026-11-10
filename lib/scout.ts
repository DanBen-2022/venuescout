import type Anthropic from "@anthropic-ai/sdk";
import { q } from "@/lib/db";
import { getJson, grokEnabled, setJson, toolKey } from "@/lib/keys";
import { apollo, apolloKey, domainFrom, EVENT_TITLES } from "@/lib/apollo";
import { claudeClient, claudeKey } from "@/lib/claude";
import { grokXSearch, perplexitySearch, placesSearch, ToolError, type WebHit } from "@/lib/research";
import { listOf, norm, ts } from "@/lib/tripleseat";
import { type Catalog, catalogForPrompt, getCatalog, proofLine } from "@/lib/venues";
import { audit } from "@/lib/audit";

// Scout, Phase 1: each night it looks for new prospects in the active markets, checks them
// cheaply first (duplicates, Tripleseat, location), asks a small Claude model to rate the rest,
// and files the good ones as unassigned prospects marked "Found by Scout" for reps to keep or reject.
// It never contacts anyone and never spends Apollo credits on emails.

export const SCOUT_MODEL = "claude-haiku-5-5";

export type ScoutConfig = { enabled: boolean; markets: string[]; perMarket: number; minScore: number; monthlyCap: number; handoff: number };
export const DEFAULT_CONFIG: ScoutConfig = { enabled: true, markets: ["finance", "professional", "tech", "tradeshow"], perMarket: 8, minScore: 3.5, monthlyCap: 150, handoff: 15000 };

export async function scoutConfig(): Promise<ScoutConfig> {
  const c = await getJson<Partial<ScoutConfig>>("scout_config");
  return { ...DEFAULT_CONFIG, ...(c || {}) };
}
export const saveScoutConfig = (c: ScoutConfig) => setJson("scout_config", c);

// Estimated prices in US dollars, for the monthly cap. Apollo credits are counted separately.
const PRICE = { pplxWeb: 0.005, pplxFast: 0.001, places: 0.032, grok: 0.15, claudeIn: 1 / 1e6, claudeOut: 5 / 1e6 };

type Playbook = { tags: string[]; places: string[]; news: string[]; grok?: string; sizes: string[] };
const BIG = ["51,200", "201,500", "501,1000", "1001,5000", "5001,10000", "10001,1000000"];
const MID = ["11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000", "10001,1000000"];
export const PLAYBOOKS: Record<string, Playbook> = {
  finance: { sizes: BIG, tags: ["private equity", "hedge fund", "wealth management", "investment banking", "asset management", "family office", "venture capital"],
    places: [], news: ["New York private equity firm closes new fund", "New York investment firm opens new office or expands headcount", "New York bank or wealth firm hosts client event or investor day"] },
  luxury: { sizes: MID, tags: ["luxury goods", "fashion", "beauty", "jewelry", "cosmetics", "fragrance"],
    places: ["luxury fashion showroom Manhattan", "fashion PR agency New York"], news: ["luxury brand launch New York store opening", "New York Fashion Week brand party announcement"],
    grok: "New York luxury, fashion or beauty brands announcing launches, store openings, pop-ups or Fashion Week events in the next few months" },
  professional: { sizes: BIG, tags: ["law firm", "legal services", "management consulting", "accounting", "advisory"],
    places: [], news: ["New York law firm opens office or merges", "consulting firm expands New York office", "Am Law firm New York new partners announced"] },
  tech: { sizes: MID, tags: ["software", "saas", "fintech", "media", "advertising", "digital media", "artificial intelligence"],
    places: [], news: ["New York startup raises Series B or Series C", "New York tech company launch event or sales kickoff", "New York media company upfront event"],
    grok: "New York tech and media companies announcing launches, funding rounds, upfronts or awards events" },
  pharma: { sizes: BIG, tags: ["pharmaceuticals", "biotechnology", "medical devices", "life sciences"],
    places: [], news: ["New York medical conference 2027 advisory board", "biotech company New York new headquarters or launch"] },
  tradeshow: { sizes: MID, tags: [], places: [], news: [] },
  nonprofit: { sizes: MID, tags: ["nonprofit", "foundation", "philanthropy", "museum", "hospital foundation"],
    places: [], news: ["New York gala 2027 announced benefit honorees", "New York foundation annual benefit dinner"] },
  social: { sizes: [], tags: [], places: ["luxury wedding planner Manhattan", "bar mitzvah planner New York", "synagogue events office Manhattan", "event florist Manhattan"], news: [] },
  entertainment: { sizes: MID, tags: ["entertainment", "film production", "music", "sports", "hospitality"],
    places: ["boutique hotel Manhattan", "film production company Manhattan"], news: ["New York film premiere party", "New York sports team event or athlete foundation gala"],
    grok: "New York premieres, wrap parties, album launches, athlete or team events being announced" },
  planners: { sizes: MID, tags: ["event planning", "events services", "experiential marketing", "destination management"],
    places: ["corporate event planner Manhattan", "experiential marketing agency New York", "event production company New York"], news: [] },
};
const MARKET_NAMES: Record<string, string> = {
  finance: "Financial services and private wealth", luxury: "Luxury, fashion and beauty brands", professional: "Law and consulting firms",
  tech: "Tech and media companies", pharma: "Pharma and life sciences", tradeshow: "Trade show exhibitors (Javits and other NYC venues)",
  nonprofit: "Nonprofit galas and foundations", social: "High-end social (referral partners only: planners, synagogues, florists)",
  entertainment: "Entertainment, sports and hospitality", planners: "Planners and agencies (referral partners)",
};
export const MARKET_IDS = Object.keys(PLAYBOOKS);

let tablesReady: Promise<unknown> | null = null;
function tables() {
  tablesReady ||= q(`
    create table if not exists scout_runs (
      id bigserial primary key, at timestamptz not null default now(), market text not null, trigger text not null,
      by_name text, found int not null default 0, checked int not null default 0, saved int not null default 0,
      cost numeric not null default 0, apollo_credits int not null default 0, notes jsonb, error text
    );
    create table if not exists scout_seen (key text primary key, market text, at timestamptz not null default now(), score real, why text);
  `).catch((e) => { tablesReady = null; throw e; });
  return tablesReady;
}

export async function monthSpend(): Promise<number> {
  await tables();
  const r = await q<{ s: string | null }>(`select sum(cost) as s from scout_runs where at >= date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York'`);
  return Number(r[0]?.s || 0);
}
export async function recentRuns(limit = 20) {
  await tables();
  return q(`select id, at, market, trigger, by_name, found, checked, saved, cost::float as cost, apollo_credits, notes, error from scout_runs order by id desc limit $1`, [limit]);
}

type Cand = {
  name: string; domain: string; via: string[]; facts: string[]; links: { title: string; url: string }[];
  employees?: number; city?: string; industry?: string; address?: string; showId?: string; pastClient?: boolean; tsNote?: string;
  inTs?: boolean; busy?: string; lastEvent?: { date: string; name: string; total: number }; tsOwner?: string; repId?: string;
};

// Tripleseat shapes Scout reads (seen in production logs 2026-11-09/10).
type TsPerson = { id?: number | string; name?: string; first_name?: string; last_name?: string; email?: string; email_address?: string } | number | string | null | undefined;
type TsAccount = { id: number | string; name?: string; owned_by?: TsPerson };
type TsBooking = { id: number | string; name?: string; status?: string; start_date?: string; total_grand_total?: number | string; total_event_grand_total?: number | string;
  account?: { id?: number | string; name?: string }; owned_by?: TsPerson };
type TsLead = { id: number | string; company?: string; created_at?: string; converted_at?: string | null; lost_at?: string | null; status?: string; owned_by?: TsPerson };
// owned_by has been seen as an object; a bare id can't be matched to a rep.
function tsWho(p: TsPerson) {
  if (!p || typeof p !== "object") return null;
  const name = (p.name || [p.first_name, p.last_name].filter(Boolean).join(" ")).trim();
  const email = String(p.email || p.email_address || "").toLowerCase();
  return name || email ? { name, email } : null;
}
// Keep only a venue and offer that really exist in the catalog.
function pitchFor(c: Catalog, it: { venue?: string; space?: string; offer?: string; media?: string; proof?: string }) {
  const v = c.venues.find((x) => norm(x.name) === norm(it.venue)) || c.venues.find((x) => it.venue && norm(it.venue).includes(norm(x.name)));
  const o = c.offers.find((x) => x.on && norm(x.title) === norm(it.offer) && (!v || x.venueIds.includes(v.id)));
  const proof = proofLine(c, String(it.proof || "").replace(/[\[\]\s]/g, ""));
  const m = v && it.media ? (v.media || []).find((x) => norm(x.title) === norm(it.media)) : undefined;
  return v ? { venue: v.name, venueId: v.id, space: clean(it.space, 80), ...(o ? { offer: o.title, offerId: o.id } : {}),
    ...(m ? { media: { title: m.title, url: m.url, kind: m.kind, clientReady: m.clientReady } } : {}),
    ...(proof ? { proof } : {}) } : {};
}

// Markets run in parallel; this stops two markets filing the same company on the same night.
const filing = new Set<string>();
const nameKey = (s: unknown) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const clean = (v: unknown, n = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const uid = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const NYC_RE = /\b(new york|ny|nyc|manhattan|brooklyn|queens|bronx|jersey city|hoboken|newark|stamford|greenwich|white plains)\b/i;

const DM_RE = /\b(ceo|coo|cmo|cfo|chief|president|founder|owner|partner|managing director|vp|vice president|svp|evp|head of|director|general manager|gm)\b/i;
const CO_RE = /\b(event|events|trade ?show|tradeshow|exhibit|meeting|planner|planning|coordinator|conference|experiential|field marketing|producer)\b/i;
function roleFor(t: string) {
  if (CO_RE.test(t) && !/\b(chief|vp|vice president|svp|evp|president)\b/i.test(t)) return "Event coordinator";
  if (DM_RE.test(t)) return "Decision maker";
  return CO_RE.test(t) ? "Event coordinator" : "Other";
}

const ASSESS_TOOL: Anthropic.Tool = {
  name: "save_assessments",
  description: "Save your assessment of every candidate, in the order given. Call exactly once.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["i", "fit", "nyc", "whyNow", "eventIdea", "estValue", "reason", "website", "venue", "space", "offer", "media", "proof"],
          properties: {
            i: { type: "integer", description: "Candidate number as given." },
            fit: { type: "number", description: "1 to 5: how likely they are to book a luxury private event venue in New York in the next 12 months." },
            nyc: { type: "boolean", description: "True only if they have an office, members or recurring events in the New York City area." },
            whyNow: { type: "string", description: "One or two plain sentences a sales rep can read: why reach out now. Cite the fact, not a guess." },
            eventIdea: { type: "string", description: "The event to pitch, e.g. 'Holiday party for ~150 staff'." },
            estValue: { type: "number", description: "Rough booking value in US dollars, 0 if unknown." },
            reason: { type: "string", description: "Short reason for the score, mentioning any doubt." },
            website: { type: "string", description: "Company domain if known, e.g. example.com, else empty." },
            venue: { type: "string", description: "Which of our venues to pitch, exactly as named in the venue list; the one whose style, size and setting fit this event best." },
            space: { type: "string", description: "The space or format within that venue, e.g. 'Full rooftop buyout' or 'Cabaret room', or empty." },
            offer: { type: "string", description: "Title of a seasonal offer from the list whose dates fit the event, exactly as named, or empty. Never invent one." },
            proof: { type: "string", description: "The [id] of the one past event (any venue) most similar to this pitch, e.g. e-dpworld, or empty. Only ids from the list." },
            media: { type: "string", description: "Title of the one media item from the chosen venue's 'Media to send' list that best supports this pitch, exactly as named, or empty." },
          },
        },
      },
    },
  },
};
const EXTRACT_TOOL: Anthropic.Tool = {
  name: "save_companies",
  description: "Save the companies found in the search results. Call exactly once.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["companies"],
    properties: {
      companies: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "website", "fact", "url"],
          properties: {
            name: { type: "string" }, website: { type: "string", description: "Domain if shown, else empty." },
            fact: { type: "string", description: "The news or reason, in one sentence." }, url: { type: "string", description: "Source URL." },
          },
        },
      },
    },
  },
};

export type RunResult = { market: string; found: number; checked: number; saved: number; cost: number; apolloCredits: number; skipped?: string; error?: string; notes: string[] };

export async function runMarket(market: string, trigger: "cron" | "manual", byName: string | null, deadline = Date.now() + 240_000): Promise<RunResult> {
  await tables();
  const cfg = await scoutConfig();
  const pb = PLAYBOOKS[market];
  const res: RunResult = { market, found: 0, checked: 0, saved: 0, cost: 0, apolloCredits: 0, notes: [] };
  const record = async () => {
    const r = await q<{ id: string }>(
      `insert into scout_runs (market, trigger, by_name, found, checked, saved, cost, apollo_credits, notes, error) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [market, trigger, byName, res.found, res.checked, res.saved, res.cost.toFixed(4), res.apolloCredits, JSON.stringify(res.notes.slice(0, 30)), res.error || res.skipped || null]
    );
    return r[0]?.id;
  };
  if (!pb) { res.error = "Unknown market."; return res; }
  const spent = await monthSpend();
  if (spent >= cfg.monthlyCap) { res.skipped = `Monthly cap of $${cfg.monthlyCap} reached ($${spent.toFixed(2)} spent).`; await record(); return res; }
  const ck = await claudeKey();
  if (!ck) { res.skipped = "Claude isn't connected."; await record(); return res; }
  const [ak, pk, gk, grokOn] = await Promise.all([apolloKey(), toolKey("perplexity"), toolKey("places"), grokEnabled()]);
  const claude = claudeClient(ck.key);
  const note = (s: string) => res.notes.push(s);

  // What we already have, so Scout never suggests a company twice.
  const docs = await q<{ data: Record<string, unknown> }>(`select data from docs where collection = 'leads'`);
  const haveName = new Set<string>(), haveDomain = new Set<string>();
  for (const { data } of docs) { haveName.add(norm(data.company)); const d = domainFrom(data.website); if (d) haveDomain.add(d); }
  const seen = new Set((await q<{ key: string }>(`select key from scout_seen where at > now() - interval '120 days'`)).map((r) => r.key));

  const cands = new Map<string, Cand>();
  const add = (c: Partial<Cand> & { name: string }, via: string) => {
    const name = clean(c.name, 120).replace(/^(the)\s+/i, "");
    const key = norm(name);
    if (!key || key.length < 2) return;
    const domain = domainFrom(c.domain);
    if (haveName.has(key) || (domain && haveDomain.has(domain)) || seen.has(key)) return;
    const ex = cands.get(key) || { name, domain: "", via: [], facts: [], links: [] };
    if (!ex.domain && domain) ex.domain = domain;
    if (!ex.via.includes(via)) ex.via.push(via);
    for (const f of c.facts || []) if (f && !ex.facts.includes(f)) ex.facts.push(f);
    for (const l of c.links || []) if (l.url && !ex.links.some((x) => x.url === l.url)) ex.links.push(l);
    ex.employees ??= c.employees; ex.city ??= c.city; ex.industry ??= c.industry; ex.address ??= c.address; ex.showId ??= c.showId;
    cands.set(key, ex);
  };
  const claudeCost = (u: { input_tokens?: number; output_tokens?: number } | undefined) => { if (u) res.cost += (u.input_tokens || 0) * PRICE.claudeIn + (u.output_tokens || 0) * PRICE.claudeOut; };

  try {
    // 1. Apollo company search: NYC-area companies in the market's industries.
    if (ak && pb.tags.length) {
      const pages = (await getJson<Record<string, number>>("scout_pages")) || {};
      const page = (pages[market] || 0) + 1;
      try {
        type Org = { name?: string; primary_domain?: string; estimated_num_employees?: number; industry?: string; city?: string; state?: string };
        const r = await apollo<{ organizations?: Org[]; accounts?: Org[]; pagination?: { total_pages?: number } }>(ak.key, "mixed_companies/search", {
          q_organization_keyword_tags: pb.tags, organization_locations: ["New York, United States"], organization_num_employees_ranges: pb.sizes, per_page: 25, page,
        });
        res.apolloCredits += 1;
        const orgs = [...(r.organizations || []), ...(r.accounts || [])];
        for (const o of orgs) if (o.name) add({ name: o.name, domain: o.primary_domain, employees: o.estimated_num_employees, city: [o.city, o.state].filter(Boolean).join(", "), industry: o.industry,
          facts: [`Apollo: ${o.industry || "company"}${o.estimated_num_employees ? `, about ${o.estimated_num_employees} staff` : ""}${o.city ? `, ${o.city}` : ""}`] }, "Apollo");
        const total = r.pagination?.total_pages || 1;
        pages[market] = page >= Math.min(total, 40) ? 0 : page;
        await setJson("scout_pages", pages);
        note(`Apollo: ${orgs.length} companies (page ${page})`);
      } catch (e) { note("Apollo search failed: " + (e instanceof Error ? e.message : "error")); }
    }

    // 2. Google Places: local partners (planners, synagogues, hotels).
    if (gk && pb.places.length) {
      const pages = (await getJson<Record<string, number>>("scout_places_i")) || {};
      const start = pages[market] || 0;
      for (let n = 0; n < 2; n++) {
        const query = pb.places[(start + n) % pb.places.length];
        try {
          const found = await placesSearch(gk.key, query, 10);
          res.cost += PRICE.places;
          for (const p of found) add({ name: p.name, address: p.address, facts: [`Google Places: ${p.address}`], links: p.mapsUrl ? [{ title: "Google Maps", url: p.mapsUrl }] : [] }, "Google Places");
          note(`Places "${query}": ${found.length}`);
        } catch (e) { note("Places failed: " + (e instanceof ToolError ? e.message : "error")); break; }
      }
      pages[market] = (start + 2) % pb.places.length;
      await setJson("scout_places_i", pages);
    }

    // 3. News triggers from Perplexity (and Grok when it's on), read by Claude for company names.
    const hits: WebHit[] = [];
    let grokText = "";
    if (pk) {
      const queries = [...pb.news];
      if (market === "tradeshow") {
        const shows = await q<{ id: string; data: { name?: string; startDate?: string } }>(`select id, data from docs where collection = 'shows'`);
        const now = Date.now();
        const soon = shows.map((s) => ({ id: s.id, ...s.data })).filter((s) => { const t = Date.parse(String(s.startDate) + "T12:00:00"); return t > now && t < now + 1000 * 60 * 60 * 24 * 130; })
          .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))).slice(0, 2);
        for (const s of soon) queries.push(`"${s.name}" ${String(s.startDate).slice(0, 4)} exhibitors booth New York Javits`);
        if (soon.length) note("Shows: " + soon.map((s) => s.name).join(", "));
      }
      for (const query of queries.slice(0, 3)) {
        try {
          const h = await perplexitySearch(pk.key, query, { max: 8, recency: market === "tradeshow" ? "year" : "month" });
          res.cost += PRICE.pplxWeb;
          hits.push(...h);
        } catch (e) { note("Perplexity failed: " + (e instanceof ToolError ? e.message : "error")); break; }
      }
    }
    if (gk === null && pb.places.length) note("Google Places isn't connected.");
    if (grokOn && pb.grok) {
      const xk = await toolKey("grok");
      if (xk) {
        try { grokText = await grokXSearch(xk.key, `Search recent posts on X. List up to 10 ${pb.grok}. For each: company name, what they announced, and the post link.`); res.cost += PRICE.grok; }
        catch (e) { note("Grok failed: " + (e instanceof ToolError ? e.message : "error")); }
      }
    }
    if (hits.length || grokText) {
      const show = market === "tradeshow" ? "These are exhibitors at upcoming New York trade shows: list exhibiting companies only, not the organizer." : "";
      const r = await claude.messages.create({
        model: SCOUT_MODEL, max_tokens: 4000,
        system: "You pull real company names out of search results for the sales team of a luxury private event venue in New York. Only list companies the results actually name. Never invent one.",
        tools: [EXTRACT_TOOL], tool_choice: { type: "tool", name: "save_companies" },
        messages: [{ role: "user", content: `Market: ${MARKET_NAMES[market]}. ${show}\nList up to 15 companies that look like possible New York event clients, with the news that makes them relevant now.\n\n` +
          hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.url}${h.date ? ` (${h.date})` : ""}\n${h.snippet}`).join("\n\n") + (grokText ? `\n\n[X posts via Grok]\n${grokText}` : "") }],
      });
      claudeCost(r.usage);
      const out = r.content.find((b) => b.type === "tool_use")?.input as { companies?: { name: string; website: string; fact: string; url: string }[] } | undefined;
      const shows = market === "tradeshow" ? await q<{ id: string; data: { name?: string } }>(`select id, data from docs where collection = 'shows'`) : [];
      for (const c of out?.companies || []) {
        const show = shows.find((s) => s.data.name && (c.fact + " " + c.url).toLowerCase().includes(String(s.data.name).toLowerCase()));
        add({ name: c.name, domain: c.website, facts: [clean(c.fact, 300)], links: /^https?:\/\//.test(c.url) ? [{ title: "News", url: clean(c.url, 500) }] : [], showId: show?.id }, "News");
      }
      note(`News: ${out?.companies?.length || 0} companies from ${hits.length} articles`);
    }

    res.found = cands.size;
    if (!cands.size) { note("Nothing new found."); await record(); return res; }

    // 4. Cheap checks first: keep the most promising ones for the paid steps.
    const list = [...cands.values()]
      .sort((a, b) => (b.via.includes("News") ? 1 : 0) - (a.via.includes("News") ? 1 : 0) || (b.employees || 0) - (a.employees || 0))
      .slice(0, Math.max(6, cfg.perMarket * 2));

    // Tripleseat (free, read-only): past clients jump the queue, companies already in motion are left
    // to whoever is handling them, and past clients go to the rep who handled their last event.
    const team = await q<{ id: string; name: string; email: string }>(`select id, name, email from users where active`).catch(() => []);
    const findRep = (w: { name: string; email: string } | null) =>
      !w ? undefined : team.find((t) => (w.email && t.email.toLowerCase() === w.email) || (w.name && nameKey(t.name) === nameKey(w.name)))?.id;
    const day = new Date().toISOString().slice(0, 10);
    const recent = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
    let tsOn = true, shapeLogged = false;
    for (const c of list) {
      if (!tsOn || Date.now() > deadline - 120_000) break;
      try {
        const accts = listOf<TsAccount>(await ts("accounts/search.json", { query: c.name }), "account").filter((a) => norm(a.name) === norm(c.name));
        // An open Tripleseat lead (inquiry) from the last 60 days means someone is already on it.
        try {
          const leads = listOf<TsLead>(await ts("leads/search.json", { query: c.name, order: "created_at", sort_direction: "desc" }), "lead");
          const open = leads.find((l) => norm(l.company) === norm(c.name) && String(l.created_at || "").slice(0, 10) >= recent && !l.converted_at && !l.lost_at && !/lost|dead|closed|convert/i.test(String(l.status || "")));
          if (open) { c.busy = `open Tripleseat lead from ${String(open.created_at).slice(0, 10)}`; continue; }
        } catch { /* the leads search is a bonus */ }
        if (!accts.length) continue;
        c.inTs = true;
        const ids = new Set(accts.map((x) => String(x.id)));
        const body = await ts("bookings/search.json", { query: c.name, show_financial: true, order: "created_at", sort_direction: "desc" });
        const bks = listOf<TsBooking>(body, "booking").filter((x) => (x.account?.id != null && ids.has(String(x.account.id))) || norm(x.account?.name) === norm(c.name));
        if (!shapeLogged && bks[0]) { shapeLogged = true; console.log("scout tripleseat owned_by", JSON.stringify(bks[0].owned_by ?? null).slice(0, 300)); }
        const st = (x: TsBooking) => String(x.status || "").toUpperCase();
        const ahead = bks.find((x) => String(x.start_date || "") >= day && ["DEFINITE", "TENTATIVE", "PROSPECT"].includes(st(x)));
        if (ahead) { c.busy = `${st(ahead).toLowerCase()} event "${clean(ahead.name, 60)}" on ${ahead.start_date}`; continue; }
        const held = bks.filter((x) => ["DEFINITE", "CLOSED"].includes(st(x)) && x.start_date && x.start_date < day)
          .sort((x, y) => String(y.start_date).localeCompare(String(x.start_date)));
        const last = held[0];
        if (last) {
          c.pastClient = true;
          c.lastEvent = { date: String(last.start_date), name: clean(last.name, 80), total: Math.round(Number(last.total_grand_total ?? last.total_event_grand_total ?? 0) || 0) };
          c.facts.push(`Past client: last event with you was "${c.lastEvent.name}" on ${c.lastEvent.date}${c.lastEvent.total ? ` ($${c.lastEvent.total.toLocaleString("en-US")})` : ""}.`);
        } else c.facts.push("Has an account in your Tripleseat (past inquiry, no event held yet).");
        const w = tsWho(last?.owned_by) || tsWho(accts[0].owned_by);
        if (w) { c.tsOwner = w.name || w.email; c.repId = findRep(w); }
      } catch { tsOn = false; }
    }
    // Leave companies already in motion alone; look at them again in about 30 days.
    const busy = list.filter((c) => c.busy);
    for (const c of busy)
      await q(`insert into scout_seen (key, market, at, score, why) values ($1, $2, now() - interval '90 days', null, $3) on conflict (key) do update set at = excluded.at, why = excluded.why`,
        [norm(c.name), market, clean("In motion: " + c.busy, 300)]);
    if (busy.length) note(`Skipped ${busy.length} already in motion in Tripleseat: ${busy.map((c) => `${c.name} (${c.busy})`).join("; ")}`.slice(0, 600));
    for (let i = list.length - 1; i >= 0; i--) if (list[i].busy) list.splice(i, 1);
    if (!list.length) { note("Everything found is already in motion."); await record(); return res; }

    // Perplexity: a quick "anything new?" check on companies that have no news yet.
    if (pk) {
      for (const c of list.filter((x) => !x.via.includes("News")).slice(0, cfg.perMarket + 4)) {
        if (Date.now() > deadline - 90_000) break;
        try {
          const h = await perplexitySearch(pk.key, `${c.name} New York ${c.domain || ""} news events`, { max: 3, recency: "month", fast: true });
          res.cost += PRICE.pplxFast;
          for (const x of h.slice(0, 2)) { c.facts.push(`${x.title}${x.date ? ` (${x.date})` : ""}: ${x.snippet.slice(0, 220)}`); c.links.push({ title: x.title.slice(0, 80) || "News", url: x.url }); }
        } catch { break; }
      }
    }
    res.checked = list.length;

    // 5. Rate them with a small Claude model, using what reps kept and rejected before.
    const catalog = await getCatalog();
    const reviewed = await q<{ data: { company?: string; scout?: { status?: string; rejectReason?: string; reason?: string } } }>(
      `select data from docs where collection = 'leads' and data->>'foundBy' = 'scout' and data->'scout'->>'status' in ('kept','rejected') and data->>'market' = $1 order by updated_at desc limit 25`, [market]);
    const lessons = reviewed.map((r) => `- ${r.data.company}: ${r.data.scout?.status === "kept" ? "KEPT" : `REJECTED (${r.data.scout?.rejectReason || "no reason"})`}`).join("\n");
    const r = await claude.messages.create({
      model: SCOUT_MODEL, max_tokens: 6000,
      system: "You are Scout, a research assistant for the sales team of a luxury private event venue in New York City (dinners, receptions, parties, galas; roughly 50 to 400 guests). " +
        "Rate each candidate honestly from the facts given. Prefer companies with a New York presence, budget for premium events, and a reason to host an event in the next 12 months. " +
        "Penalise companies with no New York presence, tiny companies, and anything that isn't a real business or organization. Never invent facts. " +
        "For high-end social, only planners, venues' referral partners and religious event offices count; never private individuals. " +
        "Pick the venue that fits each prospect: luxury venues for premium client and investor events, the casual YOTEL venues for team events, happy hours and conference crowds, the cabarets for performances and entertainment. Shape the event idea around that venue and its packages.\n\n" +
        catalogForPrompt(catalog, market),
      tools: [ASSESS_TOOL], tool_choice: { type: "tool", name: "save_assessments" },
      messages: [{ role: "user", content:
        `Market: ${MARKET_NAMES[market]}.\n` + (lessons ? `What reps decided about earlier suggestions in this market (learn from it):\n${lessons}\n\n` : "") +
        "Candidates:\n" + list.map((c, i) => `#${i} ${c.name}${c.domain ? ` (${c.domain})` : ""}${c.address ? `, ${c.address}` : c.city ? `, ${c.city}` : ""}\n` + c.facts.slice(0, 5).map((f) => "  - " + f).join("\n")).join("\n") }],
    });
    claudeCost(r.usage);
    const items = (r.content.find((b) => b.type === "tool_use")?.input as { items?: { i: number; fit: number; nyc: boolean; whyNow: string; eventIdea: string; estValue: number; reason: string; website: string; venue?: string; space?: string; offer?: string; media?: string; proof?: string }[] } | undefined)?.items || [];

    const scored = items.map((it) => ({ it, c: list[it.i] })).filter((x) => x.c)
      .map((x) => ({ ...x, score: Math.min(5, Math.max(1, Number(x.it.fit) || 1) + (x.c.pastClient ? 0.5 : 0)) }))
      .sort((a, b) => b.score - a.score);
    for (const { c, score, it } of scored)
      await q(`insert into scout_seen (key, market, score, why) values ($1,$2,$3,$4) on conflict (key) do update set at = now(), score = excluded.score, why = excluded.why`,
        [norm(c.name), market, score, clean(it.reason, 300)]);
    const keep = scored.filter((x) => x.it.nyc && x.score >= cfg.minScore).slice(0, cfg.perMarket);

    // 6. File the keepers. Apollo people search is free; emails are only bought when a rep keeps one.
    const today = new Date().toISOString().slice(0, 10);
    const names: string[] = [];
    for (const { c, it, score } of keep) {
      const fk = norm(c.name);
      if (filing.has(fk)) continue;
      filing.add(fk);
      setTimeout(() => filing.delete(fk), 600_000);
      const domain = c.domain || domainFrom(it.website);
      const contacts: { name: string; title: string; role: string; email: string; phone: string; apolloId?: string }[] = [];
      if (ak && domain && Date.now() < deadline - 20_000) {
        try {
          const p = await apollo<{ people?: { id: string; first_name?: string; last_name?: string; last_name_obfuscated?: string; title?: string }[] }>(ak.key, "mixed_people/api_search", {
            q_organization_domains_list: [domain], person_titles: EVENT_TITLES, include_similar_titles: true, person_locations: ["New York", "New Jersey", "Connecticut"], per_page: 3,
          });
          for (const x of p.people || []) contacts.push({ name: [x.first_name, x.last_name || x.last_name_obfuscated].filter(Boolean).join(" "), title: x.title || "", role: roleFor(x.title || ""), email: "", phone: "", apolloId: x.id });
        } catch { /* contacts are a bonus */ }
      }
      const id = uid();
      const lead = {
        company: c.name, website: domain, industry: c.industry || "", market, type: market === "tradeshow" ? "Exhibitor" : "",
        ...(c.showId ? { show: c.showId } : {}),
        status: "New", statusDates: { New: today }, channel: "Scout", source: "Found by Scout",
        notes: `Scout: ${clean(it.whyNow, 600)}`, contacts, javitsBefore: !!c.pastClient,
        ...(c.repId ? { owner: c.repId } : {}),
        dealValue: it.estValue > 0 ? Math.round(it.estValue) : undefined,
        foundBy: "scout",
        scout: {
          status: "pending", score: Math.round(score * 10) / 10, whyNow: clean(it.whyNow, 600), eventIdea: clean(it.eventIdea, 200), estValue: Math.round(it.estValue || 0),
          reason: clean(it.reason, 300), ...pitchFor(catalog, it), via: c.via, sources: c.links.slice(0, 5), pastClient: !!c.pastClient, inTripleseat: !!c.inTs, foundAt: new Date().toISOString(),
          ...(c.lastEvent ? { lastEvent: c.lastEvent } : {}), ...(c.tsOwner ? { tsOwner: c.tsOwner } : {}), ...(c.repId ? { routedTo: c.repId } : {}),
          handoff: !!c.pastClient || market === "planners" || market === "social" || (it.estValue || 0) >= cfg.handoff,
        },
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await q(`insert into docs (collection, id, data, updated_at) values ('leads', $1, $2, now()) on conflict do nothing`, [id, JSON.parse(JSON.stringify(lead))]);
      names.push(c.name);
    }
    res.saved = names.length;
    note(`Rated ${items.length}; filed ${names.length}${names.length ? ": " + names.join(", ") : ""}`);
    if (names.length) await audit({ id: "", name: "Scout" } as never, "scout_found", `Scout found ${names.length} new prospect${names.length === 1 ? "" : "s"} in ${MARKET_NAMES[market]}: ${names.join(", ")}`.slice(0, 900));
  } catch (e) {
    console.error("scout run failed", market, e);
    res.error = e instanceof Error ? e.message.slice(0, 300) : "Scout run failed.";
  }
  await record();
  return res;
}

// The nightly run: every active market at once, inside one function call.
export async function runAll(trigger: "cron" | "manual", byName: string | null) {
  const cfg = await scoutConfig();
  if (!cfg.enabled) return { skipped: "Scout is turned off.", results: [] as RunResult[] };
  const deadline = Date.now() + 250_000;
  const results = await Promise.all(cfg.markets.filter((m) => PLAYBOOKS[m]).map((m) => runMarket(m, trigger, byName, deadline)));
  return { results };
}
