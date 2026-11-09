import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { googleApp, googleAuthorizeUrl, googleRedirect, siteOrigin } from "@/lib/google";

export const dynamic = "force-dynamic";

// Starts "Sign in with Google".
export async function GET(req: Request) {
  const app = await googleApp();
  if (!app) return Response.redirect(new URL("/login?error=" + encodeURIComponent("Google sign-in isn't set up yet. Use your email and password."), siteOrigin(req)), 303);
  const state = randomBytes(18).toString("base64url"), nonce = randomBytes(18).toString("base64url");
  const next = new URL(req.url).searchParams.get("next") || "";
  const jar = await cookies();
  if (/^\/app\.html(\?p=[\w-]{1,80})?$/.test(next)) jar.set("vs_g_next", next, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  jar.set("vs_g_state", state + "." + nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return Response.redirect(googleAuthorizeUrl(app, googleRedirect(req), state, nonce), 303);
}
