import { canManage, currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized, viewAsTarget } from "@/lib/auth";
import { grokEnabled, setMeta, toolKey, TOOLS, type ToolName } from "@/lib/keys";
import { grokCheck, perplexitySearch, placesCheck, ToolError } from "@/lib/research";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };

const pick = async (ctx: Ctx) => {
  const { name } = await ctx.params;
  return (name in TOOLS ? name : null) as ToolName | null;
};

// Connection status for Perplexity, Google Places or Grok. Never returns the key itself.
export async function GET(_req: Request, ctx: Ctx) {
  const real = await currentUser();
  if (!real) return unauthorized();
  const u = (await viewAsTarget(real)) || real;
  const name = await pick(ctx);
  if (!name) return json({ error: "Not found" }, 404);
  const k = await toolKey(name);
  return json({
    connected: !!k, source: k?.source || null, last4: k && canManage(u) ? k.key.slice(-4) : null, canEdit: canManage(u),
    ...(name === "grok" ? { enabled: await grokEnabled() } : {}),
  });
}

async function guard(req: Request) {
  const u = await currentUser();
  if (!u) return { err: unauthorized() };
  if (!sameOrigin(req)) return { err: forbidden("Bad origin.") };
  const pb = await previewBlock(u);
  if (pb) return { err: pb };
  if (!canManage(u)) return { err: forbidden("Only Owners and Managers can change integrations.") };
  return { u };
}

// Save a key after a cheap check, or (Grok) turn it on or off.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard(req);
  if ("err" in g) return g.err;
  const name = await pick(ctx);
  if (!name) return json({ error: "Not found" }, 404);
  const body = await req.json().catch(() => ({}));
  const label = TOOLS[name].label;
  if (name === "grok" && typeof body.enabled === "boolean" && !body.key) {
    if (body.enabled && !(await toolKey("grok"))) return json({ error: "Connect a Grok key first." }, 400);
    await setMeta("grok_enabled", body.enabled ? "1" : null);
    await audit(g.u, "grok_toggle", body.enabled ? "Turned Grok on for Scout" : "Turned Grok off for Scout");
    return json({ ok: true, enabled: body.enabled });
  }
  const k = String(body.key || "").trim();
  if (k.length < 20 || /\s/.test(k)) return json({ error: `Paste the full ${label} API key.` }, 400);
  try {
    if (name === "perplexity") await perplexitySearch(k, "New York event venue", { max: 1, fast: true });
    if (name === "places") await placesCheck(k);
    if (name === "grok") await grokCheck(k);
  } catch (e) {
    return json({ error: e instanceof ToolError ? e.message : `Couldn't check the ${label} key.` }, 400);
  }
  await setMeta(TOOLS[name].meta, k);
  await audit(g.u, name + "_connect", `Connected ${label} (key ending ${k.slice(-4)})`);
  return json({ ok: true, last4: k.slice(-4) });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req);
  if ("err" in g) return g.err;
  const name = await pick(ctx);
  if (!name) return json({ error: "Not found" }, 404);
  await setMeta(TOOLS[name].meta, null);
  if (name === "grok") await setMeta("grok_enabled", null);
  await audit(g.u, name + "_disconnect", `Disconnected ${TOOLS[name].label}`);
  return json({ ok: true });
}
