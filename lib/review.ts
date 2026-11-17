import { canReview, currentUser, forbidden, sameOrigin, unauthorized, viewAsBlock, viewAsTarget, type User } from "@/lib/auth";
import { q } from "@/lib/db";

// Review mode: pinned comments on the live site, private to Owners and Reviewers.
// Comments are deliberately kept out of the audit log, which Managers can read.
export const COLS = `c.id, c.num, c.parent_id as "parentId", c.author_id as "authorId", coalesce(u.name, c.author_name) as author,
  u.role as "authorRole", c.tab, c.route, c.label, c.pos, c.body, (c.shot is not null) as "hasShot",
  c.resolved_at as "resolvedAt", c.resolved_by as "resolvedBy", c.created_at as "createdAt", c.edited_at as "editedAt"`;
export const FROM = `from review_comments c left join users u on u.id = c.author_id`;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_BODY = 4000;
const SHOT = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export const cleanShot = (v: unknown) => (typeof v === "string" && v.length < 900_000 && SHOT.test(v) ? v : null);
export const cleanBody = (v: unknown) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, MAX_BODY);
export const short = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
// A company (and the person there) a Reviewer suggests approaching, filed under a market.
export function cleanCo(v: unknown) {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { name: short(o.name, 160), contact: short(o.contact, 120), title: short(o.title, 120), reach: short(o.reach, 200) };
}

// Who may read: Owners and Reviewers. An Owner previewing as a teammate sees what that teammate would.
export async function reader(): Promise<{ err: Response } | { u: User; previewing: boolean }> {
  const real = await currentUser();
  if (!real) return { err: unauthorized() };
  const target = await viewAsTarget(real);
  if (!canReview(real) || (target && !canReview(target))) return { err: forbidden("Review comments are only for Owners and Reviewers.") };
  return { u: real, previewing: !!target };
}

// Who may write: the same people, never while previewing as someone else.
export async function writer(req: Request): Promise<{ err: Response } | { u: User }> {
  const u = await currentUser();
  if (!u) return { err: unauthorized() };
  if (!sameOrigin(req)) return { err: forbidden("Bad origin.") };
  if (!canReview(u)) return { err: forbidden("Review comments are only for Owners and Reviewers.") };
  const pb = await viewAsBlock(u);
  if (pb) return { err: pb };
  return { u };
}
