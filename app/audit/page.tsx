"use client";
import { useCallback, useEffect, useState } from "react";
import Brand from "@/components/Brand";

type Row = {
  id: string; at: string; actor_id: string | null; actor_name: string | null; action: string;
  collection: string | null; doc_id: string | null; summary: string; changes: Record<string, [unknown, unknown]> | null; ip: string | null;
};
const TYPES: [string, string][] = [
  ["", "Everything"], ["prospects", "Prospects"], ["shows", "Shows"], ["markets", "Markets"],
  ["money", "Budget and spend"], ["settings", "Settings"], ["team", "Team and sign-ins"], ["apollo", "Apollo"],
];
const when = (s: string) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const val = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default function Audit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [more, setMore] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ who: "", type: "", q: "" });
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    if (before) p.set("before", before);
    const r = await fetch("/api/audit?" + p, { cache: "no-store" });
    if (r.status === 401) { location.href = "/login"; return; }
    const j = await r.json();
    if (!r.ok) { setErr(j.error || "Couldn't load the audit log."); return; }
    setErr(""); setPeople(j.people); setMore(j.more);
    setRows((old) => (before ? [...old, ...j.rows] : j.rows));
  }, [f]);
  useEffect(() => { const t = setTimeout(() => load(), f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);

  return (
    <main className="page" style={{ maxWidth: 1060 }}>
      <div className="top">
        <Brand />
        <span style={{ display: "flex", gap: 8 }}><a className="btn ghost" href="/team">Team</a><a className="btn ghost" href="/app.html">Back to prospects</a></span>
      </div>
      <h2>Audit log</h2>
      <p className="sub">Every change to prospects, shows, markets, budget and settings, plus sign-ins, team changes and Apollo lookups. Quick edits to the same record within a few minutes are combined into one line.</p>
      <p className="err" role="alert">{err}</p>
      <div className="box">
        <div className="row">
          <label>Person<select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}><option value="">Everyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label style={{ flex: 2 }}>Search<input value={f.q} placeholder="Company, person, field…" onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        </div>
      </div>
      <div className="box">
        <table>
          <thead><tr><th style={{ width: 140 }}>When</th><th style={{ width: 160 }}>Who</th><th>What</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ verticalAlign: "top" }}>
                <td className="muted">{when(r.at)}</td>
                <td>{r.actor_name || <span className="muted">Unknown</span>}</td>
                <td>
                  <span style={{ color: r.action === "login_failed" || r.action === "delete" ? "var(--bad, #9b3a32)" : undefined }}>{r.summary}</span>
                  {r.changes && Object.keys(r.changes).length > 0 && (
                    <button className="btn ghost small" style={{ marginLeft: 8 }} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Details"}</button>
                  )}
                  {open === r.id && r.changes && (
                    <table style={{ marginTop: 8, fontSize: 13 }}>
                      <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                      <tbody>{Object.entries(r.changes).map(([k, [a, b]]) => (
                        <tr key={k}><td>{k}</td><td className="muted" style={{ wordBreak: "break-word" }}>{val(a)}</td><td style={{ wordBreak: "break-word" }}>{val(b)}</td></tr>))}
                      </tbody>
                    </table>
                  )}
                  {r.ip && <div className="muted" style={{ fontSize: 12 }}>IP {r.ip}</div>}
                </td>
              </tr>
            ))}
            {!rows.length && !err && <tr><td colSpan={3} className="muted">Nothing logged yet{f.who || f.type || f.q ? " for these filters" : ""}.</td></tr>}
          </tbody>
        </table>
        {more && <div style={{ textAlign: "center", marginTop: 12 }}><button className="btn" onClick={() => load(rows[rows.length - 1]?.id)}>Load older</button></div>}
      </div>
    </main>
  );
}
