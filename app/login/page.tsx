"use client";
import Brand from "@/components/Brand";
import { useEffect, useState } from "react";
import GoogleButton from "@/components/GoogleButton";
import { useSubmit } from "@/components/useSubmit";

export default function Login() {
  const { busy, error, post } = useSubmit();
  const [gErr, setGErr] = useState("");
  useEffect(() => { const m = new URLSearchParams(location.search).get("error"); if (m) setGErr(m); }, []);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await post("/api/auth/login", { email: f.get("email"), password: f.get("password") })) location.href = "/app.html";
  }
  return (
    <main className="center">
      <form className="card" onSubmit={onSubmit}>
        <Brand />
        <h2>Sign in</h2>
        <p className="sub">Use the email your team invited.</p>
        {gErr && <p className="err" role="alert" style={{ marginTop: 0 }}>{gErr}</p>}
        <GoogleButton />
        <label>Email<input name="email" type="email" autoComplete="email" required autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="err" role="alert">{error}</p>
        <p className="sub" style={{ margin: 0 }}>Forgot your password? Ask your Owner to send a new invite link.</p>
        <p className="sub" style={{ margin: "10px 0 0", fontSize: 12 }}><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
      </form>
    </main>
  );
}
