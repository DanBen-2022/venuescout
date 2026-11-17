import { json } from "@/lib/auth";
import { q } from "@/lib/db";
import { cleanBody, cleanCo, cleanShot, COLS, FROM, reader, short, UUID, writer } from "@/lib/review";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await reader();
  if ("err" in g) return g.err;
  const comments = await q(`select ${COLS} ${FROM} order by c.created_at`);
  return json({ me: { id: g.u.id, role: g.u.role }, canWrite: !g.previewing, comments });
}

// A new pinned comment, or a reply when parentId is set.
export async function POST(req: Request) {
  const g = await writer(req);
  if ("err" in g) return g.err;
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return json({ error: "Bad request" }, 400);
  const body = cleanBody(b.body);
  if (!body) return json({ error: "Write a comment first." }, 400);
  let row;
  if (b.parentId) {
    if (!UUID.test(String(b.parentId))) return json({ error: "Not found" }, 404);
    const parent = await q(`select id from review_comments where id = $1 and parent_id is null`, [b.parentId]);
    if (!parent[0]) return json({ error: "That comment was deleted." }, 404);
    row = await q<{ id: string }>(
      `insert into review_comments (parent_id, author_id, author_name, body) values ($1, $2, $3, $4) returning id`,
      [b.parentId, g.u.id, g.u.name, body]);
  } else {
    const pos = b.pos && typeof b.pos === "object" && !Array.isArray(b.pos) && JSON.stringify(b.pos).length < 2000 ? b.pos : {};
    delete pos.added;
    if (pos.kind === "company") { pos.co = cleanCo(pos.co); if (!pos.co.name) return json({ error: "Add the company's name." }, 400); }
    row = await q<{ id: string }>(
      `insert into review_comments (num, author_id, author_name, tab, route, label, pos, body, shot)
       values ((select coalesce(max(num), 0) + 1 from review_comments), $1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [g.u.id, g.u.name, short(b.tab, 40), short(b.route, 200), short(b.label, 200), pos, body, cleanShot(b.shot)]);
  }
  const out = await q(`select ${COLS} ${FROM} where c.id = $1`, [row[0].id]);
  return json({ ok: true, comment: out[0] });
}
