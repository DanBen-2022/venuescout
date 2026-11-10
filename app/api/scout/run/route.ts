import { canManage, currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized } from "@/lib/auth";
import { MARKET_IDS, runAll, runMarket } from "@/lib/scout";
import { audit } from "@/lib/audit";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron calls this each night. With a CRON_SECRET env var it must send "Authorization: Bearer <secret>".
// Without one, only Vercel's cron user agent is accepted, and at most one nightly run per 20 hours,
// so a stray request can never make Scout run (and spend) more than its schedule.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Not allowed" }, 401);
  } else {
    if (!/vercel-cron/i.test(req.headers.get("user-agent") || "")) return json({ error: "Not allowed" }, 401);
    const last = await q<{ at: string }>(`select at from scout_runs where trigger = 'cron' and at > now() - interval '20 hours' limit 1`).catch(() => []);
    if (last.length) return json({ skipped: "Already ran in the last 20 hours." });
  }
  return json(await runAll("cron", null));
}

// "Run now" from Settings: one market, or every active market.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (!canManage(u)) return forbidden("Only Owners and Managers can run Scout.");
  const { market } = await req.json().catch(() => ({}));
  if (market && !MARKET_IDS.includes(String(market))) return json({ error: "Unknown market." }, 400);
  await audit(u, "scout_run", `Ran Scout now${market ? ` for ${market}` : ""}`);
  if (market) return json({ results: [await runMarket(String(market), "manual", u.name)] });
  return json(await runAll("manual", u.name));
}
