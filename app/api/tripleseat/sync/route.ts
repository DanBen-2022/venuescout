import { canManage, currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSyncState, syncTripleseatLeads } from "@/lib/tsync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const nyHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date()));

async function run(by: string, who: Parameters<typeof audit>[0]) {
  const r = await syncTripleseatLeads(by);
  if ("imported" in r && (r.imported || r.updated))
    await audit(who, "tripleseat_sync", `Tripleseat sync added ${r.imported} new prospect${r.imported === 1 ? "" : "s"}${r.names.length ? ` (${r.names.join(", ")})` : ""}${r.updated ? ` and noted ${r.updated} inquiry from existing prospects` : ""}`.slice(0, 900));
  return r;
}

// Vercel Cron calls this at 13, 14, 19 and 20 UTC; only the calls that land at 9 AM or 3 PM in
// New York run, so the times hold through daylight saving. Same guard as Scout's cron.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret ? req.headers.get("authorization") !== `Bearer ${secret}` : !/vercel-cron/i.test(req.headers.get("user-agent") || "")) return json({ error: "Not allowed" }, 401);
  if (![9, 15].includes(nyHour())) return json({ skipped: "Not 9 AM or 3 PM in New York." });
  const last = (await getSyncState()).at;
  if (last && Date.now() - Date.parse(last) < 3 * 3600e3) return json({ skipped: "Synced in the last 3 hours." });
  return json(await run("Scheduled", { id: "", name: "Tripleseat sync" } as never));
}

// "Sync now" from Settings.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (!canManage(u)) return forbidden("Only Owners and Managers can run the Tripleseat sync.");
  return json(await run(u.name, u));
}
