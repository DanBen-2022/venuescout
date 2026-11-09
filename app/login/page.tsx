"use client";
import Brand from "@/components/Brand";
import { useSubmit } from "@/components/useSubmit";

export default function Login() {
  const { busy, error, post } = useSubmit();
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
        <label>Email<input name="email" type="email" autoComplete="email" required autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="err" role="alert">{error}</p>
        <p className="sub" style={{ margin: 0 }}>Forgot your password? Ask your Owner to send a new invite link.</p>
      </form>
    </main>
  );
}
