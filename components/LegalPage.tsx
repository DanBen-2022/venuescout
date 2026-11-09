import Brand from "@/components/Brand";

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <div className="top"><Brand /><a className="btn ghost" href="/login">Sign in</a></div>
      <h2>{title}</h2>
      <p className="sub">Last updated November 9, 2026</p>
      <div className="legal">{children}</div>
    </main>
  );
}
