import Anthropic from "@anthropic-ai/sdk";
import { q } from "@/lib/db";

// Claude (Anthropic API) for research tools. Key lives server-side only (meta table, or env var).
const META_KEY = "anthropic_api_key";
export const CLAUDE_MODEL = "claude-opus-5-5";

export async function claudeKey(): Promise<{ key: string; source: "settings" | "env" } | null> {
  const rows = await q<{ value: string }>(`select value from meta where key = $1`, [META_KEY]);
  if (rows[0]?.value) return { key: rows[0].value, source: "settings" };
  const env = process.env.VS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (env) return { key: env, source: "env" };
  return null;
}
export async function saveClaudeKey(key: string | null) {
  if (key) await q(`insert into meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [META_KEY, key]);
  else await q(`delete from meta where key = $1`, [META_KEY]);
}

// Base URL is set explicitly so a stray ANTHROPIC_BASE_URL on the host never redirects the key.
export function claudeClient(key: string) {
  return new Anthropic({ apiKey: key, baseURL: process.env.VS_CLAUDE_BASE_URL || "https://api.anthropic.com", timeout: 280_000, maxRetries: 1 });
}

export function claudeErrorMessage(e: unknown): { message: string; status: number } {
  if (e instanceof Anthropic.AuthenticationError) return { message: "Claude didn't accept this API key. Check it at platform.claude.com › API keys.", status: 401 };
  if (e instanceof Anthropic.PermissionDeniedError) return { message: "This Claude API key isn't allowed to do that. Check the key's workspace in the Claude Console.", status: 403 };
  if (e instanceof Anthropic.RateLimitError) return { message: "Claude is busy or your account's rate limit is reached. Try again in a minute.", status: 429 };
  if (e instanceof Anthropic.BadRequestError && /credit|billing|balance/i.test(e.message)) return { message: "Your Claude API account is out of credits. Add credits in the Claude Console under Billing.", status: 402 };
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { message: "The search took too long. Try again, or paste the directory page instead.", status: 504 };
  if (e instanceof Anthropic.APIConnectionError) return { message: "Couldn't reach Claude. Try again in a minute.", status: 502 };
  if (e instanceof Anthropic.APIError) return { message: `Claude returned an error (${e.status ?? "unknown"}).`, status: 502 };
  return { message: "Something went wrong while searching.", status: 500 };
}
