import { currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { googleApp, googleRedirect, saveGoogleApp, siteOrigin } from "@/lib/google";

export const dynamic = "force-dynamic";

// Public: the login page only needs to know whether to show the button.
// Owners also get the setup details for the Team page.
export async function GET(req: Request) {
  const app = await googleApp();
  const u = await currentUser().catch(() => null);
  const owner = u?.role === "owner";
  return json({
    enabled: !!app,
    ...(owner ? { source: app?.source || null, clientId: app?.clientId || "", redirectUri: googleRedirect(req), origin: siteOrigin(req) } : {}),
  });
}

export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (u.role !== "owner") return forbidden("Only Owners can set up Google sign-in.");
  const { clientId, clientSecret } = await req.json().catch(() => ({}));
  const id = String(clientId || "").trim(), secret = String(clientSecret || "").trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) return json({ error: "The Client ID ends in .apps.googleusercontent.com. Copy it from Google Cloud › Clients." }, 400);
  if (secret.length < 10 || /\s/.test(secret)) return json({ error: "Paste the Client secret too (it usually starts with GOCSPX-)." }, 400);
  await saveGoogleApp({ clientId: id, clientSecret: secret });
  await audit(u, "google_signin_on", "Turned on Sign in with Google");
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (u.role !== "owner") return forbidden("Only Owners can turn off Google sign-in.");
  await saveGoogleApp(null);
  await audit(u, "google_signin_off", "Turned off Sign in with Google");
  return json({ ok: true });
}
