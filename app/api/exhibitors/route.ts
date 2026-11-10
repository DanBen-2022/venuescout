import type Anthropic from "@anthropic-ai/sdk";
import { currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized } from "@/lib/auth";
import { CLAUDE_MODEL, claudeClient, claudeErrorMessage, claudeKey } from "@/lib/claude";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Row = { company: string; website?: string; industry?: string; booth?: string; evidence?: string; source?: string; confidence?: string };

const SAVE_TOOL: Anthropic.Beta.BetaTool = {
  name: "save_exhibitors",
  description: "Save the exhibitor list you found. Call this exactly once, at the end, with every company you found.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["exhibitors", "note"],
    properties: {
      exhibitors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["company", "website", "industry", "booth", "evidence", "source", "confidence"],
          properties: {
            company: { type: "string", description: "Company or brand name as it is usually written." },
            website: { type: "string", description: "Company website domain, e.g. example.com. Empty if unknown." },
            industry: { type: "string", description: "Short industry, e.g. 'Womenswear brand' or 'POS software'. Empty if unknown." },
            booth: { type: "string", description: "Booth or stand number if shown, else empty." },
            evidence: { type: "string", description: "One short phrase on how you know it exhibits, e.g. 'Listed in official exhibitor directory'." },
            source: { type: "string", description: "URL of the page that shows this company exhibits at this show. Empty only for pasted text." },
            confidence: { type: "string", enum: ["confirmed", "likely"], description: "confirmed = the official directory or the company's own page for this edition; likely = a third-party list or a previous edition." },
          },
        },
      },
      note: { type: "string", description: "One or two sentences for the user: where the list came from and anything they should know (e.g. the official directory needs a login)." },
    },
  },
};

const clean = (v: unknown, n = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// Finds a trade show's exhibitors with Claude: web search plus reading the show's directory,
// or extraction from directory text the user pasted. Returns rows for the import preview.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  const k = await claudeKey();
  if (!k) return json({ error: "Claude isn't connected. An Owner or Manager can add the key in Settings › Integrations." }, 400);

  const body = await req.json().catch(() => ({}));
  const show = clean(body.show, 200);
  const dates = clean(body.dates, 60);
  const industry = clean(body.industry, 120);
  const url = clean(body.url, 500);
  const text = String(body.text || "").slice(0, 150_000).trim();
  const exclude: string[] = Array.isArray(body.exclude) ? body.exclude.map((x: unknown) => clean(x, 100)).filter(Boolean).slice(0, 400) : [];
  if (!show && !text) return json({ error: "Pick a show, or paste the exhibitor directory text." }, 400);
  if (url && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) return json({ error: "The directory link should start with https://" }, 400);

  const pasted = !!text;
  const system =
    "You research trade show exhibitors for the sales team of a luxury private event venue in New York City. " +
    "They pitch exhibitors on hosting dinners, receptions and parties during the show week, so they need real, current exhibitor names. " +
    "Never invent or guess a company. Only include a company when a page you read (or the pasted text) shows it exhibits at this show. " +
    "Exclude the show organizer, the venue, media partners and the show's own sponsors programme pages unless the sponsor also exhibits. " +
    "When you are done, call save_exhibitors once with everything you found.";
  const lines = [
    show && `Show: ${show}${dates ? ` (${dates})` : ""}${industry ? `. Industry: ${industry}` : ""}.`,
    exclude.length ? `Already in our list, skip these: ${exclude.join("; ")}.` : "",
  ];
  let user: string;
  if (pasted) {
    user = [
      ...lines,
      "Below is text copied from the show's exhibitor directory. List every exhibiting company in it (up to 300). " +
        "Use the booth number if it appears next to the name. Leave website empty unless it is in the text. Set source to empty and confidence to confirmed.",
      "<directory_text>\n" + text + "\n</directory_text>",
    ].filter(Boolean).join("\n\n");
  } else {
    user = [
      ...lines,
      url
        ? `Start with the official exhibitor directory: ${url} . Read it with web_fetch. If it only loads in a browser or needs a login, say so in the note and fall back to web search.`
        : "Find the official exhibitor list or directory for this edition first. Many shows use Map Your Show, a10, Swapcard or similar directories; try to read them.",
      "Then search for companies announcing they will exhibit at this edition (\"visit us at booth\", \"join us at\", press releases), and reputable third-party lists. " +
        "Aim for 40 to 80 companies, best-known and largest first. Use the company's own domain for website. " +
        "Mark confirmed only when the official directory or the company's own page names this edition; anything else is likely.",
    ].filter(Boolean).join("\n\n");
  }

  const client = claudeClient(k.key);
  const tools: Anthropic.Beta.BetaToolUnion[] = pasted
    ? [SAVE_TOOL]
    : [
        { type: "web_search_20260209", name: "web_search", max_uses: 12 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8, max_content_tokens: 60_000 },
        SAVE_TOOL,
      ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: user }];
  let searches = 0, fetches = 0, nudged = false;
  type Saved = { exhibitors?: Row[]; note?: string };
  let saved = null as Saved | null;
  const started = Date.now();
  try {
    for (let turn = 0; turn < 8 && !saved; turn++) {
      const res = await client.beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: pasted ? "low" : "medium" },
        system,
        tools,
        messages,
      });
      for (const b of res.content) {
        if (b.type === "server_tool_use" && b.name === "web_search") searches++;
        if (b.type === "server_tool_use" && b.name === "web_fetch") fetches++;
        if (b.type === "tool_use" && b.name === "save_exhibitors") saved = b.input as Saved;
      }
      if (saved) break;
      if (res.stop_reason === "refusal") return json({ error: "Claude declined this search. Try pasting the directory text instead." }, 422);
      messages.push({ role: "assistant", content: res.content });
      if (res.stop_reason === "pause_turn") continue;
      if (res.stop_reason === "tool_use") {
        // A tool we don't run: answer it so the turn can go on.
        const results = res.content.filter((b) => b.type === "tool_use").map((b) => ({ type: "tool_result" as const, tool_use_id: b.id, content: "Not available. Call save_exhibitors.", is_error: true }));
        messages.push({ role: "user", content: results });
        continue;
      }
      if (nudged || Date.now() - started > 230_000) break;
      nudged = true;
      messages.push({ role: "user", content: "Please call save_exhibitors now with what you found." });
    }
  } catch (e) {
    const { message, status } = claudeErrorMessage(e);
    console.error("exhibitors search failed", e);
    return json({ error: message }, status);
  }
  const out = saved as Saved | null;
  if (!out) return json({ error: "The search didn't finish. Try again, or paste the directory page text instead." }, 504);

  const skip = new Set(exclude.map((x) => x.toLowerCase()));
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const r of out.exhibitors || []) {
    const company = clean(r.company, 120);
    const key = company.toLowerCase();
    if (!company || seen.has(key) || skip.has(key)) continue;
    seen.add(key);
    const src = clean(r.source, 500);
    rows.push({
      company,
      website: clean(r.website, 200).replace(/^https?:\/\//i, "").replace(/\/.*$/, ""),
      industry: clean(r.industry, 120),
      booth: clean(r.booth, 40),
      evidence: clean(r.evidence, 200),
      source: /^https?:\/\//i.test(src) ? src : "",
      confidence: r.confidence === "confirmed" ? "confirmed" : "likely",
    });
  }
  await audit(u, "exhibitors_find", `Found ${rows.length} exhibitors for ${show || "a pasted directory"}${pasted ? " (pasted text)" : ` (${searches} searches, ${fetches} pages read)`}`);
  return json({ rows, note: clean(out.note, 600), searches, fetches, pasted });
}
