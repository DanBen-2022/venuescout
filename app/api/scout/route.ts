import { canManage, currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized, viewAsTarget } from "@/lib/auth";
import { DEFAULT_CONFIG, MARKET_IDS, monthSpend, recentRuns, saveScoutConfig, scoutConfig } from "@/lib/scout";
import { grokEnabled, toolKey } from "@/lib/keys";
import { apolloKey } from "@/lib/apollo";
import { claudeKey } from "@/lib/claude";
import { getToken } from "@/lib/tripleseat";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Scout's settings, what it can use, this month's spend and its recent runs.
export async function GET() {
  const real = await currentUser();
  if (!real) return unauthorized();
  const u = (await viewAsTarget(real)) || real;
  const [config, spent, runs, claude, apollo, perplexity, places, grok, grokOn, ts] = await Promise.all([
    scoutConfig(), monthSpend(), recentRuns(canManage(u) ? 30 : 10), claudeKey(), apolloKey(), toolKey("perplexity"), toolKey("places"), toolKey("grok"), grokEnabled(), getToken(),
  ]);
  return json({
    config, spent, runs, canEdit: canManage(u),
    tools: { claude: !!claude, apollo: !!apollo, perplexity: !!perplexity, places: !!places, grok: !!grok && grokOn, tripleseat: !!ts },
  });
}

export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (!canManage(u)) return forbidden("Only Owners and Managers can change Scout's settings.");
  const b = await req.json().catch(() => ({}));
  const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Number(v); return v !== "" && v != null && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const old = await scoutConfig();
  const config = {
    enabled: typeof b.enabled === "boolean" ? b.enabled : old.enabled,
    markets: Array.isArray(b.markets) ? b.markets.filter((m: unknown) => MARKET_IDS.includes(String(m))).map(String) : old.markets,
    perMarket: Math.round(n(b.perMarket, 1, 25, old.perMarket ?? DEFAULT_CONFIG.perMarket)),
    minScore: n(b.minScore, 1, 5, old.minScore),
    monthlyCap: n(b.monthlyCap, 0, 5000, old.monthlyCap),
    handoff: n(b.handoff, 0, 10_000_000, old.handoff),
  };
  await saveScoutConfig(config);
  await audit(u, "scout_settings", `Changed Scout settings: ${config.enabled ? "on" : "off"}, ${config.markets.length} markets, up to ${config.perMarket} a night each, $${config.monthlyCap}/month cap`);
  return json({ ok: true, config });
}
