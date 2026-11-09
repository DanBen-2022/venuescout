import type { User } from "@/lib/auth";

export const COLLECTIONS = ["leads", "shows", "markets", "spend", "config"] as const;
export type Collection = (typeof COLLECTIONS)[number];
export const CONFIG_DOCS = ["criteria", "budget", "venue"];

// Sales see prospects that are theirs or unassigned, plus shared reference data.
export function canRead(u: User, collection: string, id: string, data: Record<string, unknown>) {
  if (u.role !== "sales") return true;
  if (collection === "spend") return false;
  if (collection === "config" && id === "budget") return false;
  if (collection === "leads") return !data.owner || data.owner === u.id;
  return true;
}

export function canWrite(
  u: User,
  collection: string,
  existing: Record<string, unknown> | null,
  next: Record<string, unknown> | null
): string | null {
  if (!(COLLECTIONS as readonly string[]).includes(collection)) return "Unknown list.";
  if (u.role !== "sales") return null;
  if (collection !== "leads") return "Only managers can change this.";
  if (existing && existing.owner && existing.owner !== u.id) return "This prospect belongs to someone else.";
  if (next && next.owner && next.owner !== u.id) return "Sales can only assign prospects to themselves.";
  return null;
}
