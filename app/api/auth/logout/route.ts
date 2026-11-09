import { currentUser, endSession, json } from "@/lib/auth";
import { audit } from "@/lib/audit";
export async function POST() {
  const u = await currentUser();
  await endSession();
  if (u) await audit(u, "logout", "Signed out");
  return json({ ok: true });
}
