"use client";
import { useCallback, useEffect, useState } from "react";
import Brand from "@/components/Brand";
import GoogleSetup from "@/components/GoogleSetup";
import { useSubmit } from "@/components/useSubmit";

type U = { id: string; email: string; name: string; role: string; active: boolean };
type I = { token: string; email: string; role: string; created_at: string };
const ROLE_HELP: Record<string, string> = {
  owner: "Everything, including the team and budget",
  manager: "All prospects, markets, budget and ROI; can invite Sales",
  sales: "Their own and unassigned prospects; no budget",
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function Team() {
  const [d, setD] = useState<{ me: { id: string; role: string }; users: U[]; invites: I[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const { busy, error, post, setError } = useSubmit();
  const load = useCallback(async () => {
    const r = await fetch("/api/users", { cache: "no-store" });
    if (r.status === 401) { location.href = "/login"; return; }
    if (r.status === 403) { setError("Only Owners and Managers can manage the team."); return; }
    setD(await r.json());
  }, [setError]);
  useEffect(() => { load(); }, [load]);
  const inviteUrl = (t: string) => `${location.origin}/invite/${t}`;

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await post("/api/users", { email: f.get("email"), role: f.get("role") });
    if (r) { setLink(inviteUrl(r.token)); form.reset(); load(); }
  }
  async function patch(id: string, body: unknown) {
    if (await post(`/api/users/${id}`, body, "PATCH")) { setMsg("Saved"); load(); }
  }
  async function revoke(t: string) {
    if (await post(`/api/users/${t}`, {}, "DELETE")) load();
  }
  const isOwner = d?.me.role === "owner";
  const roles = isOwner ? ["owner", "manager", "sales"] : ["manager", "sales"];

  return (
    <main className="page">
      <div className="top">
        <Brand />
        <span style={{ display: "flex", gap: 8 }}><a className="btn ghost" href="/audit">Audit log</a><a className="btn ghost" href="/app.html">Back to prospects</a></span>
      </div>
      <h2>Team</h2>
      <p className="sub">Invite people by email. VenueScout makes a private sign-up link for you to send them; it works once and expires in 14 days.</p>
      <p className="err" role="alert">{error}</p>
      {d && (<>
        <form className="box" onSubmit={invite}>
          <div className="row">
            <label>Email<input name="email" type="email" required /></label>
            <label>Role<select name="role" defaultValue="sales">{roles.map((r) => <option key={r} value={r}>{cap(r)}</option>)}</select></label>
            <button className="btn" disabled={busy}>Create invite link</button>
          </div>
          {link && (<p className="ok" style={{ marginTop: 12 }}>Send this link to them:<code className="link">{link}</code>
            <button type="button" className="btn ghost small" style={{ marginTop: 6 }} onClick={() => navigator.clipboard.writeText(link)}>Copy link</button></p>)}
        </form>
        <div className="box">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th></tr></thead>
            <tbody>
              {d.users.map((u) => {
                const self = u.id === d.me.id;
                const editable = !self && (isOwner || u.role === "sales");
                return (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                    <td>{u.name}{self && <span className="muted"> (you)</span>}</td>
                    <td>{u.email}</td>
                    <td>{editable ? (
                      <select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} aria-label={`Role for ${u.name}`}>
                        {(isOwner ? ["owner", "manager", "sales"] : ["sales"]).map((r) => <option key={r} value={r}>{cap(r)}</option>)}
                      </select>) : cap(u.role)}
                      <div className="muted" style={{ fontSize: 12 }}>{ROLE_HELP[u.role]}</div></td>
                    <td>{editable ? (
                      <button className="btn ghost small" onClick={() => patch(u.id, { active: !u.active })}>{u.active ? "Turn off access" : "Turn access back on"}</button>
                    ) : (u.active ? "Active" : "Off")}</td>
                  </tr>);
              })}
            </tbody>
          </table>
          <p className="ok" style={{ margin: "8px 0 0" }}>{msg}</p>
        </div>
        {isOwner && <GoogleSetup />}
        {d.invites.length > 0 && (
          <div className="box">
            <table>
              <thead><tr><th>Pending invite</th><th>Role</th><th>Link</th><th></th></tr></thead>
              <tbody>{d.invites.map((i) => (
                <tr key={i.token}><td>{i.email}</td><td>{cap(i.role)}</td>
                  <td><button className="btn ghost small" onClick={() => navigator.clipboard.writeText(inviteUrl(i.token))}>Copy link</button></td>
                  <td><button className="btn ghost small" onClick={() => revoke(i.token)}>Cancel</button></td></tr>))}
              </tbody>
            </table>
          </div>)}
      </>)}
    </main>
  );
}
