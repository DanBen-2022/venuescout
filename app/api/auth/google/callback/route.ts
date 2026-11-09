import { cookies } from "next/headers";
import { startSession } from "@/lib/auth";
import { q } from "@/lib/db";
import { audit, ipOf } from "@/lib/audit";
import { googleApp, googleProfile, googleRedirect, siteOrigin } from "@/lib/google";

export const dynamic = "force-dynamic";

// Google sends the person back here. Only people already on the team (or with a pending invite
// for the same email) get in; Google sign-in never creates an account on its own.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = siteOrigin(req);
  const fail = (msg: string) => Response.redirect(new URL("/login?error=" + encodeURIComponent(msg), origin), 303);
  const jar = await cookies();
  const [state, nonce] = String(jar.get("vs_g_state")?.value || "").split(".");
  jar.delete("vs_g_state");
  const nx = jar.get("vs_g_next")?.value || ""; jar.delete("vs_g_next");
  const home = /^\/app\.html(\?p=[\w-]{1,80})?$/.test(nx) ? nx : "/app.html";
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in didn't finish. Try again.");
  const code = url.searchParams.get("code");
  if (!code || !state || url.searchParams.get("state") !== state) return fail("The Google sign-in link expired. Try again.");
  const app = await googleApp();
  if (!app) return fail("Google sign-in isn't set up yet.");
  let p;
  try { p = await googleProfile(app, code, googleRedirect(req)); } catch (e) { return fail(e instanceof Error ? e.message : "Google sign-in didn't finish."); }
  if (p.aud !== app.clientId || (nonce && p.nonce !== nonce)) return fail("Google sign-in didn't check out. Try again.");
  if (!p.email || !p.emailVerified) return fail("Google didn't confirm that email address.");

  const users = await q<{ id: string; name: string; active: boolean }>(`select id, name, active from users where email = $1`, [p.email]);
  const u = users[0];
  if (u && !u.active) {
    await audit({ id: u.id, name: u.name }, "login_failed", `Google sign-in refused for ${p.email} (access is off)`, { ip: ipOf(req) });
    return fail("Your VenueScout access is turned off. Ask your Owner.");
  }
  if (u) {
    await startSession(u.id);
    await audit({ id: u.id, name: u.name }, "login", "Signed in with Google", { ip: ipOf(req) });
    return Response.redirect(new URL(home, origin), 303);
  }
  // A pending invite for this exact email: join the team with Google instead of a password.
  const inv = (await q<{ token: string; role: string }>(
    `select token, role from invites where lower(email) = $1 and used_at is null and created_at > now() - interval '14 days' order by created_at desc limit 1`, [p.email]))[0];
  if (inv) {
    const name = p.name || p.email.split("@")[0];
    const rows = await q<{ id: string }>(`insert into users (email, name, role) values ($1, $2, $3) returning id`, [p.email, name, inv.role]);
    await q(`update invites set used_at = now() where token = $1`, [inv.token]);
    await startSession(rows[0].id);
    await audit({ id: rows[0].id, name }, "invite_accept", `Joined as ${inv.role} (${p.email}) with Google`, { ip: ipOf(req) });
    return Response.redirect(new URL(home, origin), 303);
  }
  await audit(null, "login_failed", `Google sign-in refused for ${p.email.slice(0, 120)} (not on the team)`, { ip: ipOf(req) });
  return fail(`${p.email} isn't on the VenueScout team. Ask your Owner for an invite, or use the email your team invited.`);
}
