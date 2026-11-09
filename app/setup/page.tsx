"use client";
import Brand from "@/components/Brand";
import { useSubmit } from "@/components/useSubmit";

export default function Setup() {
  const { busy, error, post } = useSubmit();
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await post("/api/auth/setup", Object.fromEntries(f.entries()));
    if (ok) location.href = "/app.html";
  }
  return (
    <main className="center">
      <form className="card" onSubmit={onSubmit}>
        <Brand />
        <h2>Create the Owner account</h2>
        <p className="sub">This works once. After that, the Owner invites everyone else.</p>
        <label>Setup code<input name="token" required autoComplete="off" /></label>
        <label>Your name<input name="name" required autoComplete="name" /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password (10+ characters)<input name="password" type="password" minLength={10} required autoComplete="new-password" /></label>
        <button className="btn wide" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <p className="err" role="alert">{error}</p>
      </form>
    </main>
  );
}
