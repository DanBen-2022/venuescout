import { cookies } from "next/headers";
import { canManage, currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { exchangeCode, redirectUri, TripleseatError } from "@/lib/tripleseat";

export const dynamic = "force-dynamic";

// Tripleseat sends the user back here after they approve VenueScout.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (status: string, msg = "") =>
    Response.redirect(new URL(`/app.html?tripleseat=${status}${msg ? "&msg=" + encodeURIComponent(msg) : ""}#settings`, redirectUri(req)), 303);
  const u = await currentUser();
  if (!u) return Response.redirect(new URL("/login", redirectUri(req)), 303);
  if (!canManage(u)) return back("error", "Only Owners and Managers can connect Tripleseat.");
  const jar = await cookies();
  const expected = jar.get("vs_ts_state")?.value;
  jar.delete("vs_ts_state");
  if (url.searchParams.get("error")) return back("error", "Tripleseat sign-in was cancelled.");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("error", "The sign-in link expired. Click Connect again.");
  try {
    await exchangeCode(code, redirectUri(req));
  } catch (e) {
    return back("error", e instanceof TripleseatError ? e.message : "Couldn't finish connecting Tripleseat.");
  }
  await audit(u, "tripleseat_connect", "Connected Tripleseat");
  return back("connected");
}
