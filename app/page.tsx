import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const u = await currentUser();
  if (u) redirect("/app.html");
  const n = await q<{ n: number }>(`select count(*)::int as n from users`);
  redirect(n[0].n === 0 ? "/setup" : "/login");
}
