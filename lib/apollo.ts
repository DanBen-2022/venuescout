import { q } from "@/lib/db";

// Apollo.io REST API. Key lives server-side only (meta table, or APOLLO_API_KEY env var).
const BASE = process.env.APOLLO_BASE_URL || "https://api.apollo.io/api/v1/";
const META_KEY = "apollo_api_key";

export async function apolloKey(): Promise<{ key: string; source: "settings" | "env" } | null> {
  const rows = await q<{ value: string }>(`select value from meta where key = $1`, [META_KEY]);
  if (rows[0]?.value) return { key: rows[0].value, source: "settings" };
  if (process.env.APOLLO_API_KEY) return { key: process.env.APOLLO_API_KEY, source: "env" };
  return null;
}
export async function saveApolloKey(key: string | null) {
  if (key) await q(`insert into meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [META_KEY, key]);
  else await q(`delete from meta where key = $1`, [META_KEY]);
}

export class ApolloError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Params = Record<string, string | number | boolean | string[] | undefined>;

export async function apollo<T = Record<string, unknown>>(key: string, path: string, params: Params, method: "GET" | "POST" = "POST"): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x));
    else qs.append(k, String(v));
  }
  let r: Response;
  try {
    r = await fetch(BASE + path + "?" + qs.toString(), {
      method,
      headers: { "x-api-key": key, "Content-Type": "application/json", "Cache-Control": "no-cache", Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new ApolloError("Couldn't reach Apollo. Try again in a minute.", 502);
  }
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (r.ok) return body as T;
  const msg = String(body.error || body.message || "");
  if (r.status === 401) throw new ApolloError("Apollo didn't accept this API key. Check it in Apollo under Settings › Integrations › API.", 401);
  if (r.status === 403)
    throw new ApolloError(
      `This Apollo key isn't allowed to use ${path.split("/")[0] === "people" ? "contact lookup" : "search"}. In Apollo, edit the key and turn on "Set as master key" (or enable this endpoint).`,
      403
    );
  if (r.status === 429) throw new ApolloError("Apollo's hourly or daily limit for your plan is used up. Try again later.", 429);
  if (r.status === 422 && /credit/i.test(msg)) throw new ApolloError("Your Apollo account is out of credits.", 402);
  throw new ApolloError(msg ? `Apollo: ${msg}` : `Apollo returned an error (${r.status}).`, 502);
}

export function domainFrom(website: unknown): string {
  const s = String(website || "").trim();
  if (!s) return "";
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : "https://" + s).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

// Titles that run or approve events. Apollo also matches similar titles.
export const EVENT_TITLES = [
  "events", "event manager", "event marketing", "trade show", "tradeshow", "field marketing", "experiential",
  "meetings and events", "conference", "corporate events", "brand experience", "vp marketing", "chief marketing officer", "head of marketing",
];
