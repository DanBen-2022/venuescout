// Perplexity search, Google Places text search and Grok X search, plus a cheap key check for each.

export class ToolError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// ---------- Perplexity Search API ----------
export type WebHit = { title: string; url: string; snippet: string; date: string | null };
const PPLX = process.env.PERPLEXITY_BASE_URL || "https://api.perplexity.ai/";

export async function perplexitySearch(
  key: string,
  query: string,
  opts: { max?: number; recency?: "day" | "week" | "month" | "year"; fast?: boolean; domains?: string[] } = {}
): Promise<WebHit[]> {
  const body: Record<string, unknown> = { query, max_results: Math.min(20, opts.max || 5), max_tokens_per_page: 512, country: "US" };
  if (opts.recency) body.search_recency_filter = opts.recency;
  if (opts.fast) body.search_type = "fast";
  if (opts.domains?.length) body.search_domain_filter = opts.domains.slice(0, 20);
  let r: Response;
  try {
    r = await fetch(PPLX + "search", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ToolError("Couldn't reach Perplexity. Try again in a minute.", 502);
  }
  if (r.status === 401 || r.status === 403) throw new ToolError("Perplexity didn't accept this API key. Check it at console.perplexity.ai under API keys.", 401);
  if (r.status === 402) throw new ToolError("Your Perplexity API account is out of credit. Add credit at console.perplexity.ai.", 402);
  if (r.status === 429) throw new ToolError("Perplexity is rate-limiting requests. Try again in a minute.", 429);
  const j = (await r.json().catch(() => ({}))) as { results?: Partial<WebHit>[]; error?: { message?: string }; detail?: unknown };
  if (!r.ok) {
    const msg = j.error?.message || "";
    if (/credit|balance|quota|billing/i.test(msg)) throw new ToolError("Your Perplexity API account is out of credit. Add credit at console.perplexity.ai.", 402);
    throw new ToolError(`Perplexity returned an error (${r.status}).`, 502);
  }
  return (j.results || [])
    .filter((x) => x && x.url)
    .map((x) => ({ title: String(x.title || ""), url: String(x.url), snippet: String(x.snippet || "").slice(0, 700), date: x.date || null }));
}

// ---------- Google Places API (New) Text Search ----------
export type Place = { id: string; name: string; address: string; types: string[]; mapsUrl: string; status: string; website?: string; phone?: string };
const PLACES = process.env.GOOGLE_PLACES_BASE_URL || "https://places.googleapis.com/v1/";
// Pro fields only, so searches stay in the cheaper Text Search Pro tier (5,000 free a month).
const PRO_MASK = "places.id,places.displayName,places.formattedAddress,places.types,places.googleMapsUri,places.businessStatus";
// Manhattan, Brooklyn and nearby New Jersey.
const NYC = { circle: { center: { latitude: 40.7484, longitude: -73.9857 }, radius: 20000 } };

async function places(key: string, path: string, body: unknown, mask: string) {
  let r: Response;
  try {
    r = await fetch(PLACES + path, {
      method: "POST",
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ToolError("Couldn't reach Google Places. Try again in a minute.", 502);
  }
  const j = (await r.json().catch(() => ({}))) as { places?: Record<string, unknown>[]; error?: { message?: string; status?: string } };
  if (r.ok) return j;
  const m = j.error?.message || "";
  if (r.status === 429 || /quota/i.test(m)) throw new ToolError("Today's Google Places limit is used up. Scout tries again tomorrow.", 429);
  if (r.status === 403 && /not been used|disabled|blocked|not authorized|restrict/i.test(m))
    throw new ToolError("This Google key can't use Places API (New). In Google Cloud, enable Places API (New) and allow it in the key's API restrictions.", 403);
  if (r.status === 400 || r.status === 403) throw new ToolError("Google didn't accept this API key. Check it in Google Cloud under Keys & Credentials.", 401);
  throw new ToolError(`Google Places returned an error (${r.status}).`, 502);
}

export async function placesSearch(key: string, textQuery: string, pageSize = 10): Promise<Place[]> {
  const j = await places(key, "places:searchText", { textQuery, pageSize, locationBias: NYC, regionCode: "US" }, PRO_MASK);
  return (j.places || []).map((p) => ({
    id: String(p.id || ""),
    name: String((p.displayName as { text?: string } | undefined)?.text || ""),
    address: String(p.formattedAddress || ""),
    types: (p.types as string[]) || [],
    mapsUrl: String(p.googleMapsUri || ""),
    status: String(p.businessStatus || ""),
  })).filter((p) => p.name && p.status !== "CLOSED_PERMANENTLY");
}

// IDs-only search: the cheapest call, used to check a key.
export async function placesCheck(key: string) {
  await places(key, "places:searchText", { textQuery: "event venue New York", pageSize: 1 }, "places.id");
}

// ---------- Grok (xAI) X search ----------
const XAI = process.env.XAI_BASE_URL || "https://api.x.ai/v1/";
export const GROK_MODEL = "grok-4.3";

export async function grokCheck(key: string) {
  let r: Response;
  try {
    r = await fetch(XAI + "models", { headers: { Authorization: "Bearer " + key }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ToolError("Couldn't reach xAI. Try again in a minute.", 502);
  }
  if (r.status === 401 || r.status === 403 || r.status === 400) throw new ToolError("xAI didn't accept this API key. Check it at console.x.ai.", 401);
  if (!r.ok) throw new ToolError(`xAI returned an error (${r.status}).`, 502);
}

// Asks Grok to search recent X posts and summarise who is announcing events in New York.
// Returns plain text with links for Claude to read. Only used when Grok is turned on.
export async function grokXSearch(key: string, prompt: string): Promise<string> {
  let r: Response;
  try {
    r = await fetch(XAI + "responses", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: GROK_MODEL, input: prompt, tools: [{ type: "x_search" }], max_output_tokens: 2000 }),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new ToolError("Couldn't reach xAI.", 502);
  }
  const j = (await r.json().catch(() => ({}))) as { output_text?: string; output?: { content?: { text?: string }[] }[] };
  if (!r.ok) throw new ToolError(`xAI returned an error (${r.status}).`, r.status === 401 ? 401 : 502);
  if (j.output_text) return j.output_text.slice(0, 8000);
  return (j.output || []).flatMap((o) => (o.content || []).map((c) => c.text || "")).join("\n").slice(0, 8000);
}
