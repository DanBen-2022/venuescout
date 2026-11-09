import { canManage, currentUser, forbidden, json, unauthorized } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

const GROUPS: Record<string, string> = {
  prospects: "collection = 'leads'",
  shows: "collection = 'shows'",
  markets: "collection = 'markets'",
  money: "(collection = 'spend' or (collection = 'config' and doc_id = 'budget'))",
  settings: "(collection = 'config' and doc_id <> 'budget')",
  team: "action in ('login','login_failed','logout','setup','invite','invite_accept','invite_revoke','role','access','view_as','view_as_end')",
  apollo: "action like 'apollo%'",
};

// Owners and Managers read the audit log, newest first, 100 at a time.
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!canManage(u)) return forbidden("Only Owners and Managers can see the audit log.");
  const p = new URL(req.url).searchParams;
  const where: string[] = [];
  const args: unknown[] = [];
  const before = Number(p.get("before"));
  if (before > 0) { args.push(before); where.push(`id < $${args.length}`); }
  const who = p.get("who");
  if (who && /^[0-9a-f-]{36}$/i.test(who)) { args.push(who); where.push(`actor_id = $${args.length}`); }
  const group = p.get("type");
  if (group && GROUPS[group]) where.push(GROUPS[group]);
  const text = (p.get("q") || "").trim().slice(0, 100);
  if (text) {
    args.push(`%${text.replace(/[\\%_]/g, (c) => "\\" + c)}%`);
    where.push(`(summary ilike $${args.length} or actor_name ilike $${args.length})`);
  }
  const doc = p.get("doc");
  if (doc) { args.push(doc.slice(0, 200)); where.push(`doc_id = $${args.length}`); }
  const rows = await q(
    `select id::text, at, actor_id, actor_name, action, collection, doc_id, summary, changes, ip from audit
     ${where.length ? "where " + where.join(" and ") : ""} order by id desc limit 101`,
    args
  );
  const people = await q(`select id, name from users order by name`);
  return json({ rows: rows.slice(0, 100), more: rows.length > 100, people });
}
