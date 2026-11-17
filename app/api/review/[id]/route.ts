import { forbidden, json } from "@/lib/auth";
import { q } from "@/lib/db";
import { cleanBody, cleanCo, COLS, FROM, reader, short, UUID, writer } from "@/lib/review";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
type Row = { id: string; author_id: string; parent_id: string | null; pos: Record<string, unknown> | null };

async function find(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return null;
  return (await q<Row>(`select id, author_id, parent_id, pos from review_comments where id = $1`, [id]))[0] || null;
}

// The screenshot saved with a comment.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await reader();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const row = UUID.test(id) ? (await q<{ shot: string | null }>(`select shot from review_comments where id = $1`, [id]))[0] : null;
  const m = row?.shot && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(row.shot);
  if (!m) return json({ error: "Not found" }, 404);
  return new Response(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}

// Edit your own comment, or mark a comment resolved / open again.
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await writer(req);
  if ("err" in g) return g.err;
  const row = await find(ctx);
  if (!row) return json({ error: "That comment was deleted." }, 404);
  const b = await req.json().catch(() => ({}));
  if (b.body !== undefined) {
    if (row.author_id !== g.u.id) return forbidden("You can only edit your own comments.");
    const body = cleanBody(b.body);
    if (!body) return json({ error: "Write a comment first." }, 400);
    await q(`update review_comments set body = $2, edited_at = now() where id = $1`, [row.id, body]);
  }
  // A suggested company: its author corrects the details; an Owner records the prospect made from it.
  if (b.co !== undefined || b.addedLead !== undefined) {
    if (row.pos?.kind !== "company") return json({ error: "That isn't a suggested company." }, 400);
    const pos = { ...row.pos };
    if (b.co !== undefined) {
      if (row.author_id !== g.u.id) return forbidden("You can only edit your own comments.");
      const co = cleanCo(b.co);
      if (!co.name) return json({ error: "Add the company's name." }, 400);
      pos.co = co;
      if (b.body === undefined) await q(`update review_comments set edited_at = now() where id = $1`, [row.id]);
    }
    if (b.addedLead !== undefined) {
      if (g.u.role !== "owner") return forbidden("Only an Owner can add a suggested company to Prospects.");
      pos.added = short(b.addedLead, 80) || undefined;
    }
    await q(`update review_comments set pos = $2 where id = $1`, [row.id, pos]);
  }
  if (typeof b.resolved === "boolean") {
    if (row.parent_id) return json({ error: "Resolve the comment, not a reply." }, 400);
    await q(`update review_comments set resolved_at = $2, resolved_by = $3 where id = $1`, [row.id, b.resolved ? new Date() : null, b.resolved ? g.u.name : null]);
  }
  const out = await q(`select ${COLS} ${FROM} where c.id = $1`, [row.id]);
  return json({ ok: true, comment: out[0] });
}

// Delete your own comment. Deleting a pinned comment removes its replies too.
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await writer(req);
  if ("err" in g) return g.err;
  const row = await find(ctx);
  if (!row) return json({ ok: true });
  if (row.author_id !== g.u.id) return forbidden("You can only delete your own comments.");
  await q(`delete from review_comments where id = $1`, [row.id]);
  return json({ ok: true });
}
