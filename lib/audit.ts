import { q } from "@/lib/db";

// Audit log: who did what, when. Writes never fail the action they describe.
type Actor = { id: string; name: string } | null;
type Changes = Record<string, [unknown, unknown]>;

const LABEL: Record<string, string> = {
  leads: "prospect", shows: "show", markets: "market", spend: "spend entry", config: "setting",
};
const FIELD: Record<string, string> = {
  eventName: "event", eventDate: "event date", pastEvents: "past events", boothSqft: "booth size", dealValue: "deal value",
  javitsBefore: "past client", considerFirst: "consider first", statusDates: "stage dates",
};
const SKIP = new Set(["updatedAt", "statusDates"]);

export function ipOf(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
}

export async function audit(
  actor: Actor,
  action: string,
  summary: string,
  extra: { collection?: string; docId?: string; changes?: Changes | null; ip?: string | null } = {}
) {
  try {
    await q(
      `insert into audit (actor_id, actor_name, action, collection, doc_id, summary, changes, ip) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [actor?.id || null, actor?.name || null, action, extra.collection || null, extra.docId || null, summary.slice(0, 1000), extra.changes || null, extra.ip || null]
    );
  } catch (e) {
    console.error("audit write failed", e);
  }
}

const short = (v: unknown): unknown => {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v.length > 300 ? v.slice(0, 300) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = JSON.stringify(v);
  return s.length > 600 ? s.slice(0, 600) + "…" : v;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || ((a == null || a === "") && (b == null || b === ""));

export function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): Changes {
  const out: Changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    if (SKIP.has(k)) continue;
    const a = before?.[k], b = after?.[k];
    if (!same(a, b)) out[k] = [short(a), short(b)];
  }
  return out;
}

function nameOf(col: string, id: string, d: Record<string, unknown> | null) {
  const n = d && (d.company || d.name || d.label);
  return n ? String(n) : col === "config" ? id : id;
}

function describe(field: string, [a, b]: [unknown, unknown], users: Map<string, string>): string {
  const label = FIELD[field] || field;
  if (field === "contacts") {
    const names = (v: unknown) => (Array.isArray(v) ? v.map((c) => String((c as { name?: string })?.name || "").trim()).filter(Boolean) : []);
    const A = names(a), B = names(b);
    const added = B.filter((x) => !A.includes(x)), removed = A.filter((x) => !B.includes(x));
    const parts = [added.length && "added " + added.join(", "), removed.length && "removed " + removed.join(", ")].filter(Boolean);
    return "people: " + (parts.length ? parts.join("; ") : "details edited");
  }
  const fmt = (v: unknown) => {
    if (v == null || v === "") return "empty";
    if (field === "owner") return users.get(String(v)) || "someone";
    if (typeof v === "boolean") return v ? "yes" : "no";
    if (typeof v === "object") return "…";
    const s = String(v);
    return s.length > 40 ? "edited" : s;
  };
  if (field === "notes") return "notes edited";
  const fa = fmt(a), fb = fmt(b);
  return fa === "edited" || fb === "edited" || fa === "…" ? label + " edited" : `${label}: ${fa} → ${fb}`;
}

async function userNames() {
  const rows = await q<{ id: string; name: string }>(`select id, name from users`);
  return new Map(rows.map((r) => [r.id, r.name]));
}

// Logs a saved or deleted document. Rapid autosaves of the same document by the same person
// within 3 minutes are folded into one entry.
export async function auditDoc(
  actor: { id: string; name: string },
  col: string,
  id: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
) {
  try {
    const what = LABEL[col] || col;
    const name = nameOf(col, id, after || before);
    if (!after) return audit(actor, "delete", `Deleted ${what} ${name}`, { collection: col, docId: id });
    let changes = diff(before, after);
    if (!before) return audit(actor, "create", `Added ${what} ${name}`, { collection: col, docId: id });
    if (!Object.keys(changes).length) return;
    const last = (await q<{ id: string; action: string; actor_id: string | null; changes: Changes | null; recent: boolean }>(
      `select id, action, actor_id, changes, at > now() - interval '3 minutes' as recent from audit
       where collection = $1 and doc_id = $2 order by id desc limit 1`, [col, id]))[0];
    const fold = last && last.recent && last.action === "update" && last.actor_id === actor.id;
    if (fold) {
      const merged: Changes = { ...(last.changes || {}) };
      for (const [k, [a, b]] of Object.entries(changes)) merged[k] = [k in merged ? merged[k][0] : a, b];
      for (const k of Object.keys(merged)) if (same(merged[k][0], merged[k][1])) delete merged[k];
      changes = merged;
    }
    const users = await userNames();
    const summary = Object.keys(changes).length
      ? `Changed ${what} ${name}: ` + Object.entries(changes).map(([k, v]) => describe(k, v, users)).join("; ")
      : `Edited ${what} ${name} (no net change)`;
    if (fold) await q(`update audit set at = now(), summary = $2, changes = $3 where id = $1`, [last.id, summary.slice(0, 1000), changes]);
    else await audit(actor, "update", summary, { collection: col, docId: id, changes });
  } catch (e) {
    console.error("audit doc failed", e);
  }
}
