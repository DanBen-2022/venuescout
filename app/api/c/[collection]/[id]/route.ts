import { currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized } from "@/lib/auth";
import { canWrite, COLLECTIONS, CONFIG_DOCS } from "@/lib/access";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ collection: string; id: string }> };
const ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

async function guard(req: Request, ctx: Ctx) {
  const u = await currentUser();
  if (!u) return { err: unauthorized() };
  if (!sameOrigin(req)) return { err: forbidden("Bad origin.") };
  const pb = await previewBlock(u);
  if (pb) return { err: pb };
  const { collection, id } = await ctx.params;
  if (!(COLLECTIONS as readonly string[]).includes(collection) || !ID.test(id)) return { err: json({ error: "Not found" }, 404) };
  if (collection === "config" && !CONFIG_DOCS.includes(id)) return { err: json({ error: "Not found" }, 404) };
  const ex = await q<{ data: Record<string, unknown> }>(`select data from docs where collection = $1 and id = $2`, [collection, id]);
  return { u, collection, id, existing: ex[0]?.data ?? null };
}

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if ("err" in g) return g.err;
  const { u, collection, id, existing } = g;
  let data: Record<string, unknown>;
  try {
    data = await req.json();
  } catch {
    return json({ error: "Bad JSON" }, 400);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "Bad document" }, 400);
  if (JSON.stringify(data).length > 512 * 1024) return json({ error: "Document too large" }, 413);
  delete (data as { id?: unknown }).id;
  // A new prospect created by a sales rep is theirs.
  if (collection === "leads" && !existing && u.role === "sales" && !data.owner) data.owner = u.id;
  const why = canWrite(u, collection, existing, data);
  if (why) return forbidden(why);
  await q(
    `insert into docs (collection, id, data, updated_at, updated_by) values ($1, $2, $3, now(), $4)
     on conflict (collection, id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by`,
    [collection, id, data, u.id]
  );
  return json({ ok: true, data });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if ("err" in g) return g.err;
  const { u, collection, id, existing } = g;
  if (!existing) return json({ ok: true });
  const why = canWrite(u, collection, existing, null);
  if (why) return forbidden(why);
  await q(`delete from docs where collection = $1 and id = $2`, [collection, id]);
  return json({ ok: true });
}
