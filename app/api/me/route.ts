import { currentUser, json, unauthorized } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const u = await currentUser();
  return u ? json({ id: u.id, name: u.name, email: u.email, role: u.role }) : unauthorized();
}
