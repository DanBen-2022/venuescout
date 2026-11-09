import { currentUser, forbidden, json, previewBlock, sameOrigin, unauthorized } from "@/lib/auth";
import { apollo, apolloKey, ApolloError } from "@/lib/apollo";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Phone = { sanitized_number?: string; raw_number?: string };
type Match = {
  person?: {
    id?: string; name?: string; first_name?: string; last_name?: string; title?: string; email?: string; email_status?: string;
    linkedin_url?: string; phone_numbers?: Phone[]; contact?: { phone_numbers?: Phone[] };
    organization?: { name?: string; website_url?: string; primary_domain?: string };
  };
};

// Gets one person's work email (about 1 Apollo credit). Mobile numbers are not requested:
// Apollo charges ~8 extra credits and delivers them later by webhook.
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return unauthorized();
  if (!sameOrigin(req)) return forbidden("Bad origin.");
  const pb = await previewBlock(u);
  if (pb) return pb;
  const k = await apolloKey();
  if (!k) return json({ error: "Apollo isn't connected yet." }, 400);
  const { id, email: byEmail } = await req.json().catch(() => ({}));
  const mail = String(byEmail || "").trim().toLowerCase();
  const okMail = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(mail);
  if (!okMail && (!id || !/^[A-Za-z0-9]{6,40}$/.test(String(id)))) return json({ error: byEmail ? "That doesn't look like an email address." : "Missing person." }, 400);
  try {
    const r = await apollo<Match>(k.key, "people/match", okMail ? { email: mail, reveal_personal_emails: false } : { id: String(id), reveal_personal_emails: false });
    const p = r.person;
    if (!p) return json({ error: okMail ? `Apollo has nobody with the email ${mail}.` : "Apollo has no details for this person." }, 404);
    const phones = [...(p.contact?.phone_numbers || []), ...(p.phone_numbers || [])];
    await audit(u, "apollo_reveal", `Looked up ${p.name || "a person"}${p.organization?.name ? " at " + p.organization.name : ""} in Apollo (uses credits)`);
    const email = p.email && !/email_not_unlocked|domain\.com$/i.test(p.email) ? p.email : okMail ? mail : "";
    return json({
      id: p.id || (okMail ? "" : String(id)),
      company: p.organization?.name || "",
      name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" "),
      title: p.title || "",
      email,
      emailStatus: p.email_status || "",
      phone: phones[0]?.sanitized_number || phones[0]?.raw_number || "",
      linkedin: p.linkedin_url || "",
      website: p.organization?.website_url || (p.organization?.primary_domain ? "https://" + p.organization.primary_domain : ""),
    });
  } catch (e) {
    if (e instanceof ApolloError) return json({ error: e.message }, e.status === 401 || e.status === 403 ? 400 : e.status);
    throw e;
  }
}
