"use client";
import { use, useEffect, useState } from "react";
import Brand from "@/components/Brand";
import GoogleButton from "@/components/GoogleButton";
import { useSubmit } from "@/components/useSubmit";

export default function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [inv, setInv] = useState<{ email: string; role: string } | null>(null);
  const [bad, setBad] = useState("");
  const { busy, error, post } = useSubmit();
  useEffect(() => {
    fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`)
      .then(async (r) => { const d = await r.json(); if (r.ok) setInv(d); else setBad(d.error); })
      .catch(() => setBad("Can't reach VenueScout."));
  }, [token]);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await post("/api/auth/invite", { token, name: f.get("name"), password: f.get("password") })) location.href = "/app.html";
  }
  return (
    <main className="center">
      <form className="card" onSubmit={onSubmit}>
        <Brand />
        {bad ? (<><h2>Invite unavailable</h2><p className="sub">{bad} Ask your Owner or Manager for a new link.</p><a href="/login">Go to sign in</a></>)
        : !inv ? <p className="sub">Checking your invite…</p>
        : (<>
            <h2>Join your team</h2>
            <p className="sub">You're joining as <b>{inv.role[0].toUpperCase() + inv.role.slice(1)}</b> with {inv.email}.</p>
            <GoogleButton label={`Join with Google (${inv.email})`} />
            <label>Your name<input name="name" required autoComplete="name" autoFocus /></label>
            <label>Choose a password (10+ characters)<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
            <button className="btn wide" disabled={busy}>{busy ? "Saving…" : "Join VenueScout"}</button>
            <p className="err" role="alert">{error}</p>
          </>)}
      </form>
    </main>
  );
}
