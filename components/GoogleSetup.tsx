"use client";
import { useCallback, useEffect, useState } from "react";
import { useSubmit } from "@/components/useSubmit";

type Cfg = { enabled: boolean; source: "settings" | "env" | null; clientId: string; redirectUri: string; origin: string };

// Owner-only box on the Team page: turn "Sign in with Google" on or off.
export default function GoogleSetup() {
  const [c, setC] = useState<Cfg | null>(null);
  const [edit, setEdit] = useState(false);
  const [armed, setArmed] = useState(false);
  const { busy, error, post } = useSubmit();
  const load = useCallback(async () => { const r = await fetch("/api/auth/google/config", { cache: "no-store" }); if (r.ok) setC(await r.json()); }, []);
  useEffect(() => { load(); }, [load]);
  if (!c || !c.redirectUri) return null;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await post("/api/auth/google/config", { clientId: f.get("clientId"), clientSecret: f.get("clientSecret") }, "PUT")) { setEdit(false); load(); }
  }
  async function off() {
    if (!armed) { setArmed(true); return; }
    if (await post("/api/auth/google/config", {}, "DELETE")) { setArmed(false); load(); }
  }
  const copy = (t: string) => navigator.clipboard.writeText(t);
  return (
    <div className="box">
      <h3 style={{ margin: "0 0 4px", fontFamily: "var(--f-display)", fontSize: 21 }}>Sign in with Google</h3>
      {c.enabled && !edit ? (<>
        <p className="ok" style={{ margin: "0 0 8px" }}>On. The sign-in page shows a Google button{c.source === "env" ? " (set on the server)" : ""}.</p>
        <p className="sub" style={{ margin: "0 0 10px" }}>Only people on this team, or with a pending invite for the same email, can get in with Google. Passwords keep working too. Client ID: <code>{c.clientId}</code></p>
        {c.source !== "env" && <span style={{ display: "flex", gap: 8 }}><button className="btn ghost small" onClick={() => setEdit(true)}>Change Client ID or Secret</button>
          <button className="btn ghost small" onClick={off} disabled={busy}>{armed ? "Click again to turn off" : "Turn off"}</button></span>}
      </>) : (
        <form onSubmit={save}>
          <p className="sub" style={{ margin: "0 0 8px" }}>Lets your team sign in with their Google (Gmail or Google Workspace) account instead of a password. Set it up once in Google Cloud:</p>
          <ol className="sub" style={{ margin: "0 0 12px", paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Go to <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">console.cloud.google.com › Google Auth Platform</a> and pick or create a project (e.g. VenueScout).</li>
            <li>Under <b>Branding</b>, set the app name VenueScout and your support email. Under <b>Audience</b>, choose <b>Internal</b> if everyone uses your Google Workspace domain, otherwise <b>External</b> and click <b>Publish app</b>.</li>
            <li>Under <b>Clients</b>, click <b>+ Create client</b>, type <b>Web application</b>, name VenueScout.</li>
            <li>Authorized JavaScript origins: <code className="link">{c.origin}</code>
              <button type="button" className="btn ghost small" onClick={() => copy(c.origin)}>Copy</button></li>
            <li>Authorized redirect URIs: <code className="link">{c.redirectUri}</code>
              <button type="button" className="btn ghost small" onClick={() => copy(c.redirectUri)}>Copy</button></li>
            <li>Click <b>Create</b>, then paste the <b>Client ID</b> and <b>Client secret</b> here.</li>
          </ol>
          <div className="row">
            <label>Client ID<input name="clientId" autoComplete="off" required placeholder="…apps.googleusercontent.com" defaultValue={edit ? c.clientId : ""} /></label>
            <label>Client secret<input name="clientSecret" type="password" autoComplete="off" required placeholder="GOCSPX-…" /></label>
            <button className="btn" disabled={busy}>{busy ? "Saving…" : "Turn on Google sign-in"}</button>
            {edit && <button type="button" className="btn ghost" onClick={() => setEdit(false)}>Cancel</button>}
          </div>
        </form>)}
      <p className="err" role="alert">{error}</p>
    </div>
  );
}
