import { q } from "@/lib/db";

// "Sign in with Google" (OpenID Connect, authorization code flow). The Owner pastes the OAuth
// Client ID and Secret on the Team page (stored in the meta table), or sets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
const AUTH = process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const META = "google_signin";

export type GoogleApp = { clientId: string; clientSecret: string };

export async function googleApp(): Promise<(GoogleApp & { source: "settings" | "env" }) | null> {
  const r = await q<{ value: string }>(`select value from meta where key = $1`, [META]);
  try { if (r[0]) return { ...(JSON.parse(r[0].value) as GoogleApp), source: "settings" }; } catch { /* fall through */ }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, source: "env" };
  return null;
}
export async function saveGoogleApp(a: GoogleApp | null) {
  if (a) await q(`insert into meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value`, [META, JSON.stringify(a)]);
  else await q(`delete from meta where key = $1`, [META]);
}

export function siteOrigin(req: Request) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "venuescouthq.com";
  const proto = req.headers.get("x-forwarded-proto") || (/^localhost|^127\./.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
export const googleRedirect = (req: Request) => siteOrigin(req) + "/api/auth/google/callback";

export function googleAuthorizeUrl(app: GoogleApp, redirect: string, state: string, nonce: string) {
  const p = new URLSearchParams({ client_id: app.clientId, redirect_uri: redirect, response_type: "code", scope: "openid email profile", state, nonce, prompt: "select_account" });
  return AUTH + "?" + p.toString();
}

export type GoogleProfile = { email: string; emailVerified: boolean; name: string; nonce: string; aud: string };

// Swaps the code for tokens and reads the ID token. It comes straight from Google over TLS in exchange
// for our client secret, so its claims can be trusted without checking the signature (Google's OIDC docs).
export async function googleProfile(app: GoogleApp, code: string, redirect: string): Promise<GoogleProfile> {
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
    cache: "no-store",
  });
  const body = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
  if (!r.ok || !body.id_token) {
    if (body.error === "invalid_client") throw new Error("Google didn't accept the Client ID or Secret. Check them on the Team page.");
    if (body.error === "redirect_uri_mismatch") throw new Error("The redirect URL in Google Cloud doesn't match. See the Team page for the exact URL.");
    throw new Error("Google sign-in didn't finish" + (body.error_description ? `: ${body.error_description}` : ".") );
  }
  const part = body.id_token.split(".")[1] || "";
  const c = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { email?: string; email_verified?: boolean | string; name?: string; nonce?: string; aud?: string };
  return { email: String(c.email || "").toLowerCase(), emailVerified: c.email_verified === true || c.email_verified === "true", name: c.name || "", nonce: c.nonce || "", aud: c.aud || "" };
}
