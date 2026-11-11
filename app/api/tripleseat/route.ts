import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { canManage, currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized, viewAsTarget } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSyncState } from "@/lib/tsync";
import { authorizeUrl, getApp, getToken, redirectUri, saveApp, saveToken } from "@/lib/tripleseat";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const real = await currentUser();
  if (!real) return unauthorized();
  const u = (await viewAsTarget(real)) || real;
  const [app, tok, sync] = await Promise.all([getApp(), getToken(), getSyncState()]);
  return json({ configured: !!app, connected: !!(app && tok), canEdit: canManage(u), redirectUri: redirectUri(req), sync });
}

// Save the Client Application's UID and Secret (or reuse the saved ones) and start the Tripleseat sign-in.
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (!canManage(u)) return forbidden("Only Owners and Managers can connect Tripleseat.");
  const { clientId, clientSecret } = await req.json().catch(() => ({}));
  let app = await getApp();
  const id = String(clientId || "").trim(), secret = String(clientSecret || "").trim();
  if (id || secret) {
    if (id.length < 8 || secret.length < 8 || /\s/.test(id + secret)) return json({ error: "Paste both the UID and the Secret from Tripleseat." }, 400);
    app = { clientId: id, clientSecret: secret };
    await saveApp(app);
  }
  if (!app) return json({ error: "Paste the UID and Secret from Tripleseat first." }, 400);
  const state = randomBytes(18).toString("base64url");
  (await cookies()).set("vs_ts_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return json({ url: authorizeUrl(app, redirectUri(req), state) });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (!canManage(u)) return forbidden("Only Owners and Managers can disconnect Tripleseat.");
  await saveToken(null);
  await saveApp(null);
  await audit(u, "tripleseat_disconnect", "Disconnected Tripleseat");
  return json({ ok: true });
}
