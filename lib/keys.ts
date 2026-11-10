import { q } from "@/lib/db";

// Keys and settings stored server-side in the meta table. Keys are never sent to the browser.
export async function getMeta(key: string): Promise<string | null> {
  const r = await q<{ value: string }>(`select value from meta where key = $1`, [key]);
  return r[0]?.value ?? null;
}
export async function setMeta(key: string, value: string | null) {
  if (value == null) await q(`delete from meta where key = $1`, [key]);
  else await q(`insert into meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [key, value]);
}
export async function getJson<T>(key: string): Promise<T | null> {
  const v = await getMeta(key);
  try { return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
export const setJson = (key: string, v: unknown) => setMeta(key, v == null ? null : JSON.stringify(v));

// The research tools Scout uses besides Apollo, Tripleseat and Claude.
export const TOOLS = {
  perplexity: { meta: "perplexity_api_key", env: "PERPLEXITY_API_KEY", label: "Perplexity" },
  places: { meta: "google_places_api_key", env: "GOOGLE_PLACES_API_KEY", label: "Google Places" },
  grok: { meta: "xai_api_key", env: "XAI_API_KEY", label: "Grok" },
} as const;
export type ToolName = keyof typeof TOOLS;

export async function toolKey(name: ToolName): Promise<{ key: string; source: "settings" | "env" } | null> {
  const t = TOOLS[name];
  const v = await getMeta(t.meta);
  if (v) return { key: v, source: "settings" };
  const env = process.env[t.env];
  return env ? { key: env, source: "env" } : null;
}

// Grok is built but stays off until an Owner or Manager turns it on.
export async function grokEnabled() {
  return (await getMeta("grok_enabled")) === "1";
}
