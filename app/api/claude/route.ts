import { canManage, currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized, viewAsTarget } from "@/lib/auth";
import { claudeClient, claudeErrorMessage, claudeKey, saveClaudeKey } from "@/lib/claude";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Connection status. Never returns the key itself.
export async function GET() {
  const real = await currentUser();
  if (!real) return unauthorized();
  const u = (await viewAsTarget(real)) || real;
  const k = await claudeKey();
  return json({ connected: !!k, source: k?.source || null, last4: k && canManage(u) ? k.key.slice(-4) : null, canEdit: canManage(u) });
}

// Save a key (owners and managers). Checked with a free models list first.
export async function PUT(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (!canManage(u)) return forbidden("Only Owners and Managers can connect Claude.");
  const { key } = await req.json().catch(() => ({}));
  const k = String(key || "").trim();
  if (!/^sk-ant-[\w-]{20,}$/.test(k)) return json({ error: "Paste the full API key from the Claude Console. It starts with sk-ant-." }, 400);
  try {
    await claudeClient(k).models.list({ limit: 1 });
  } catch (e) {
    return json({ error: claudeErrorMessage(e).message }, 400);
  }
  await saveClaudeKey(k);
  await audit(u, "claude_connect", `Connected Claude (key ending ${k.slice(-4)})`);
  return json({ ok: true, last4: k.slice(-4) });
}

export async function DELETE(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  if (!canManage(u)) return forbidden("Only Owners and Managers can disconnect Claude.");
  await saveClaudeKey(null);
  await audit(u, "claude_disconnect", "Disconnected Claude");
  return json({ ok: true });
}
