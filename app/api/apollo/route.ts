import { canManage, currentUser, forbidden, json, sameOrigin, unauthorized } from "@/lib/auth";
import { apollo, apolloKey, ApolloError, saveApolloKey } from "@/lib/apollo";

export const dynamic = "force-dynamic";

// Connection status. Never returns the key itself.
export async function GET() {
  const u = await currentUser();
  if (!u) return unauthorized();
  const k = await apolloKey();
  return json({ connected: !!k, source: k?.source || null, last4: k && canManage(u) ? k.key.slice(-4) : null, canEdit: canManage(u) });
}

// Save a key (owners and managers). Checked with a free people search first.
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  if (!canManage(u)) return forbidden("Only Owners and Managers can connect Apollo.");
  const { key } = await req.json().catch(() => ({}));
  const k = String(key || "").trim();
  if (k.length < 10 || /\s/.test(k)) return json({ error: "Paste the full API key from Apollo." }, 400);
  let warning: string | null = null;
  try {
    await apollo(k, "mixed_people/api_search", { "q_organization_domains_list": ["apollo.io"], per_page: 1 });
  } catch (e) {
    if (e instanceof ApolloError && e.status === 401) return json({ error: e.message }, 400);
    if (e instanceof ApolloError && e.status === 403) warning = e.message;
    else if (e instanceof ApolloError) warning = "Saved, but Apollo didn't answer the test search: " + e.message;
    else throw e;
  }
  await saveApolloKey(k);
  return json({ ok: true, last4: k.slice(-4), warning });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  if (!canManage(u)) return forbidden("Only Owners and Managers can disconnect Apollo.");
  await saveApolloKey(null);
  return json({ ok: true });
}
