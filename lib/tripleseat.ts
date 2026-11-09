import { q } from "@/lib/db";

// Tripleseat API (OAuth 2.0, authorization code flow). Docs: support.tripleseat.com "API Getting Started"
// and the OAuth 1.0 to 2.0 migration guide. Access tokens last 2 hours and are refreshed automatically.
const API = process.env.TRIPLESEAT_API_URL || "https://api.tripleseat.com/";
const AUTH = process.env.TRIPLESEAT_LOGIN_URL || "https://login.tripleseat.com/";
export const SCOPES = "read";

type App = { clientId: string; clientSecret: string };
type Token = { access: string; refresh: string; expiresAt: number };

async function getMeta<T>(key: string): Promise<T | null> {
  const r = await q<{ value: string }>(`select value from meta where key = $1`, [key]);
  try { return r[0] ? (JSON.parse(r[0].value) as T) : null; } catch { return null; }
}
async function setMeta(key: string, v: unknown) {
  if (v == null) await q(`delete from meta where key = $1`, [key]);
  else await q(`insert into meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [key, JSON.stringify(v)]);
}
export const getApp = () => getMeta<App>("tripleseat_app");
export const saveApp = (a: App | null) => setMeta("tripleseat_app", a);
export const getToken = () => getMeta<Token>("tripleseat_token");
export const saveToken = (t: Token | null) => setMeta("tripleseat_token", t);

export class TripleseatError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function redirectUri(req: Request) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "venuescouthq.com";
  const proto = req.headers.get("x-forwarded-proto") || (/^localhost|^127\./.test(host) ? "http" : "https");
  return `${proto}://${host}/api/tripleseat/callback`;
}

export function authorizeUrl(app: App, redirect: string, state: string) {
  const p = new URLSearchParams({ client_id: app.clientId, redirect_uri: redirect, response_type: "code", scope: SCOPES, state });
  return AUTH + "oauth2/authorize?" + p.toString();
}

async function tokenCall(params: Record<string, string>): Promise<Token> {
  const r = await fetch(API + "oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  }).catch(() => null);
  if (!r) throw new TripleseatError("Couldn't reach Tripleseat. Try again in a minute.", 502);
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || !j.access_token) {
    const why = String(j.error_description || j.error || r.status);
    throw new TripleseatError(`Tripleseat didn't accept the connection (${why}). Check the UID, Secret and Redirect URL in Tripleseat.`, 400);
  }
  return { access: String(j.access_token), refresh: String(j.refresh_token || ""), expiresAt: Date.now() + (Number(j.expires_in) || 7200) * 1000 };
}

export async function exchangeCode(code: string, redirect: string) {
  const app = await getApp();
  if (!app) throw new TripleseatError("Tripleseat isn't set up yet.", 400);
  const t = await tokenCall({ grant_type: "authorization_code", code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirect });
  await saveToken(t);
  return t;
}

async function accessToken(): Promise<string> {
  const [app, t] = await Promise.all([getApp(), getToken()]);
  if (!app || !t) throw new TripleseatError("Tripleseat isn't connected. An Owner can connect it in Settings › Integrations.", 400);
  if (t.expiresAt - Date.now() > 60_000) return t.access;
  if (!t.refresh) throw new TripleseatError("The Tripleseat connection expired. Reconnect it in Settings › Integrations.", 400);
  try {
    const n = await tokenCall({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: app.clientId, client_secret: app.clientSecret });
    if (!n.refresh) n.refresh = t.refresh;
    await saveToken(n);
    return n.access;
  } catch {
    throw new TripleseatError("The Tripleseat connection expired. Reconnect it in Settings › Integrations.", 400);
  }
}

export async function ts<T = unknown>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const token = await accessToken();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.append(k, String(v));
  const r = await fetch(API + "v1/" + path + (qs.size ? "?" + qs : ""), {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store",
  }).catch(() => null);
  if (!r) throw new TripleseatError("Couldn't reach Tripleseat. Try again in a minute.", 502);
  if (r.status === 401) throw new TripleseatError("Tripleseat signed VenueScout out. Reconnect it in Settings › Integrations.", 400);
  if (r.status === 403) throw new TripleseatError("The Tripleseat user who connected can't see this. Reconnect with an admin user.", 400);
  if (r.status === 429) throw new TripleseatError("Tripleseat is rate-limiting requests. Try again in a minute.", 429);
  if (!r.ok) throw new TripleseatError(`Tripleseat returned an error (${r.status}).`, 502);
  return (await r.json()) as T;
}

// Tripleseat list responses have been seen as {results: [...]}, plain arrays, and arrays of {booking: {...}}.
export function listOf<T>(body: unknown, key: string): T[] {
  const b = body as Record<string, unknown>;
  const arr = Array.isArray(body) ? body : Array.isArray(b?.results) ? b.results : Array.isArray(b?.[key + "s"]) ? b[key + "s"] : [];
  return (arr as Record<string, unknown>[]).map((x) => ((x && typeof x === "object" && key in x ? x[key] : x) as T));
}

export const norm = (s: unknown) =>
  String(s || "").toLowerCase().replace(/^(sample|example):\s*/, "").replace(/&/g, "and")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|the)\b\.?/g, "").replace(/[^a-z0-9]/g, "");
