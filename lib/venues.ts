import { getJson, setJson } from "@/lib/keys";

// The venues Scout sells, and the offers it may pitch. Managers edit this in Settings › Venues and offers.
export type Venue = {
  id: string; name: string; company: string; location: string; style: string;
  seated: number; standing: number; about: string; spaces: string; packages: string; bestFor: string[]; contact: string;
  social: Social; media: Media[]; pastEvents: PastEvent[];
};
// Proof for pitches. canName = the client agreed (or it's public) that we can name them; otherwise Scout says `who`.
export type PastEvent = { id: string; client: string; who: string; canName: boolean; title: string; month: string; guests: number; market: string; space: string; link: string };
export type Social = { website: string; instagram: string; tiktok: string; facebook: string; linkedin: string; youtube: string };
// Reels, photos, decks and menus reps can send. clientReady = the link opens for people outside the team.
export type Media = { id: string; title: string; url: string; kind: string; note: string; clientReady: boolean };
export const MEDIA_KINDS = ["Reel", "Video", "Photos", "Deck", "Menu", "Floor plan", "Press", "Other"];
export const SOCIAL_KEYS: (keyof Social)[] = ["website", "instagram", "tiktok", "facebook", "linkedin", "youtube"];
const noSocial = (): Social => ({ website: "", instagram: "", tiktok: "", facebook: "", linkedin: "", youtube: "" });
const ev = (id: string, client: string, who: string, title: string, month: string, market: string, space = "", guests = 0, link = ""): PastEvent =>
  ({ id, client, who, canName: false, title, month, guests, market, space, link });
const asset = (n: number) => `https://assets.thegreenroom42.com/?open=${n}`;
// Seasonal offers repeat every year between two month-day dates (MM-DD); a window like 11-15 to 01-15 wraps the new year.
export type Offer = { id: string; title: string; venueIds: string[]; from: string; to: string; details: string; priceFrom: string; on: boolean };
export type Catalog = { venues: Venue[]; offers: Offer[] };

export const VENUE_STYLES = ["Luxury", "Upscale", "Modern upscale", "Casual"];

const HUDSON = "Hudson VU Rooftop, LLC", FIG = "Green Fig NYC, LLC";
export const DEFAULT_CATALOG: Catalog = {
  venues: [
    {
      id: "hudsonvu", name: "Hudson VU Rooftop", company: HUDSON, location: "Ink48 Hotel, Hell's Kitchen", style: "Luxury", seated: 0, standing: 235,
      about: "Rooftop with sweeping 360° views of New York City. 10,000 sq ft, two full-service bars, elevator access, dedicated coat check and restrooms. Large group reservations to full buyouts for up to 235; seated dinner or reception.",
      spaces: "Full rooftop buyout (up to 235)\nSunroom",
      packages: "Passed canapés from $55pp (1 hour)\nGrazing tables $20–35pp\nStationed menu $85 / $115 / $135pp\nSeated dinners $95–155pp\nOpen bar: beer and wine $50pp, Gold $60pp, Platinum $75pp (2 hours)\nPlus 24% admin fee and NYS sales tax",
      bestFor: ["finance", "luxury", "professional", "pharma", "nonprofit", "social", "tech"], contact: "privateevents@hudsonvunyc.com · (917) 477-0001",
      social: noSocial(), media: [
        { id: "m-hvu-reel", title: "Hudson VU sizzle reel", url: asset(6322), kind: "Reel", note: "The rooftop at its best; send with first outreach.", clientReady: false },
        { id: "m-hvu-deck", title: "Hudson VU private events deck 2026", url: asset(1702), kind: "Deck", note: "Spaces, menus and bar packages with pricing.", clientReady: false },
      ],
      pastEvents: [
        ev("e-dpworld", "DP World", "a global logistics company", "FIFA World Cup rooftop buyout", "2026-07", "entertainment", "Full rooftop buyout", 0, asset(142342)),
        ev("e-gip", "GI Partners", "a private equity firm", "Summer outing", "2026-07", "finance", "Sunroom", 0, asset(20531)),
        ev("e-magic", "Magic Labs", "a tech company", "Business dinner", "2026-06", "tech", "Sunroom", 0, asset(21157)),
        ev("e-ypo", "YPO", "a global CEO network", "Cocktail reception", "2026-06", "professional", "", 0, asset(21670)),
        ev("e-mc", "Morning Consult", "a data and research company", "Catered event", "2026-08", "tech", "", 0, asset(141920)),
        ev("e-amp", "AMP Sports", "a sports company", "Sports event", "2026-09", "entertainment", "", 0, asset(18685)),
        ev("e-wed", "", "a wedding party", "Pre-wedding welcome drinks", "2026-08", "social"),
      ],
    },
    {
      id: "hudsonlocal", name: "Hudson Local", company: HUDSON, location: "Ink48 Hotel, Hell's Kitchen", style: "Upscale", seated: 93, standing: 0,
      about: "Upscale restaurant and lounge with a 93-seat cabaret room for performances, screenings and hosted dinners.",
      spaces: "Cabaret room (93 seated)", packages: "", bestFor: ["entertainment", "luxury", "professional", "social"], contact: "privateevents@hudsonvunyc.com",
      social: noSocial(), media: [], pastEvents: [],
    },
    {
      id: "greenfig", name: "Green Fig", company: FIG, location: "YOTEL New York, Times Square West", style: "Casual", seated: 0, standing: 0,
      about: "Relaxed restaurant and bar at YOTEL New York for team events, happy hours, receptions and conference after-parties.",
      spaces: "", packages: "", bestFor: ["tech", "tradeshow", "nonprofit", "planners"], contact: "",
      social: noSocial(), media: [{ id: "m-gf-packet", title: "Green Fig events packet 2026", url: asset(11385), kind: "Deck", note: "Spaces, menus and packages.", clientReady: false }],
      pastEvents: [
        ev("e-brivo", "Brivo", "a security tech company", "Happy hour", "2026-11", "tech", "", 0, asset(17)),
        ev("e-spac", "SPAC Conference", "a finance conference", "Conference reception", "2026-07", "finance", "", 0, asset(21121)),
        ev("e-covenant", "Covenant House", "a youth charity", "Reception", "2026-08", "nonprofit", "", 0, asset(20566)),
        ev("e-after5", "After5 Society", "a professional society", "Lecture and reception", "2026-09", "professional", "", 0, asset(141741)),
      ],
    },
    {
      id: "sdf", name: "Social Drink and Food", company: FIG, location: "YOTEL New York, Times Square West", style: "Casual", seated: 0, standing: 0,
      about: "Casual bar and terrace at YOTEL New York for networking receptions, happy hours and large mingles.",
      spaces: "Tented West\nMiddle\nPurple Lounge (check-in overflow)", packages: "", bestFor: ["tech", "tradeshow", "planners"], contact: "",
      social: noSocial(), media: [], pastEvents: [
        ev("e-aws", "AWS", "a cloud computing company", "GenAI Security and Compliance networking event", "2024-07", "tech", "Tented West", 200),
        ev("e-druva", "Druva", "a data security company", "Networking event", "2024-07", "tech", "Middle"),
      ],
    },
    {
      id: "gr42", name: "The Green Room 42", company: FIG, location: "YOTEL New York, Times Square West", style: "Modern upscale", seated: 155, standing: 0,
      about: "Modern upscale 155-seat cabaret room with a full stage, sound and lighting, for shows, launches, award nights and hosted performances.",
      spaces: "Cabaret room (155 seated)", packages: "", bestFor: ["entertainment", "tech", "nonprofit", "social"], contact: "",
      social: noSocial(), media: [{ id: "m-gr42-packet", title: "Events packet 2026 (cabaret and private events)", url: asset(11385), kind: "Deck", note: "Cabaret and private event packages.", clientReady: false }], pastEvents: [],
    },
  ],
  offers: [
    { id: "o-holiday", title: "Holiday parties", venueIds: ["hudsonvu", "greenfig", "sdf", "gr42"], from: "11-01", to: "01-15", details: "Draft: edit details and turn on.", priceFrom: "", on: false },
    { id: "o-summer", title: "Summer on the rooftop", venueIds: ["hudsonvu"], from: "05-15", to: "09-30", details: "Draft: edit details and turn on.", priceFrom: "", on: false },
  ],
};

// Catalogs saved before the media section get the new fields (and the starter media) filled in.
export async function getCatalog(): Promise<Catalog> {
  const c = await getJson<Catalog>("venue_catalog");
  if (!c || !Array.isArray(c.venues)) return DEFAULT_CATALOG;
  const venues = c.venues.map((v) => {
    const d = DEFAULT_CATALOG.venues.find((x) => x.id === v.id);
    return { ...v, social: { ...noSocial(), ...(v.social || {}) }, media: Array.isArray(v.media) ? v.media : d ? d.media : [],
      pastEvents: Array.isArray(v.pastEvents) ? v.pastEvents : d ? d.pastEvents : [] };
  });
  return { venues, offers: Array.isArray(c.offers) ? c.offers : [] };
}
export const saveCatalog = (c: Catalog) => setJson("venue_catalog", c);

const md = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inWindow = (x: string, from: string, to: string) => (from <= to ? x >= from && x <= to : x >= from || x <= to);
// An offer is worth pitching when its season starts within `ahead` days (or is running now).
export function upcomingOffers(c: Catalog, ahead = 150, now = new Date()) {
  return c.offers.filter((o) => o.on && /^\d\d-\d\d$/.test(o.from) && /^\d\d-\d\d$/.test(o.to)).filter((o) => {
    for (let d = 0; d <= ahead; d += 3) if (inWindow(md(new Date(now.getTime() + d * 864e5)), o.from, o.to)) return true;
    return false;
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const prettyMd = (s: string) => (/^\d\d-\d\d$/.test(s) ? `${MONTHS[Number(s.slice(0, 2)) - 1] || "?"} ${Number(s.slice(3))}` : s);

// What Scout reads before pitching: the venues that suit this market first, then offers in season soon.
export function catalogForPrompt(c: Catalog, market: string) {
  const vs = [...c.venues].sort((a, b) => Number(b.bestFor.includes(market)) - Number(a.bestFor.includes(market)));
  const cap = (v: Venue) => [v.seated ? `${v.seated} seated` : "", v.standing ? `${v.standing} standing` : ""].filter(Boolean).join(", ");
  const venues = vs.map((v) => `- ${v.name} (${v.style}; ${v.location}${cap(v) ? `; ${cap(v)}` : ""})${v.bestFor.includes(market) ? " [suits this market]" : ""}: ${v.about}` +
    (v.spaces ? ` Spaces: ${v.spaces.replace(/\n/g, "; ")}.` : "") + (v.packages ? ` Packages: ${v.packages.replace(/\n/g, "; ")}.` : "") +
    (v.pastEvents.length ? ` Past events here (proof): ${v.pastEvents.map((e) => `[${e.id}] ${e.canName && e.client ? e.client : e.who}: ${e.title}${e.month ? ", " + e.month : ""}${e.guests ? `, ${e.guests} guests` : ""} (${e.market})`).join("; ")}.` : "") +
    (v.media.length ? ` Media to send: ${v.media.map((m) => `"${m.title}" (${m.kind}${m.note ? `: ${m.note}` : ""})`).join("; ")}.` : "")).join("\n");
  const name = (id: string) => c.venues.find((v) => v.id === id)?.name || id;
  const offers = upcomingOffers(c).map((o) => `- "${o.title}" at ${o.venueIds.map(name).join(", ")}, ${prettyMd(o.from)} to ${prettyMd(o.to)}${o.priceFrom ? `, from ${o.priceFrom}` : ""}: ${o.details}`).join("\n");
  return `Our venues:\n${venues}\n` + (offers ? `Seasonal offers in season now or soon (pitch one only if its dates fit the event):\n${offers}\n` : "No seasonal offers are running; don't invent one.\n");
}

// The one-line proof a rep can say: names the client only when allowed.
export function proofLine(c: Catalog, id: string | undefined) {
  if (!id) return null;
  for (const v of c.venues) {
    const e = (v.pastEvents || []).find((x) => x.id === id);
    if (!e) continue;
    const who = e.canName && e.client ? e.client : e.who || "a client";
    const when = /^\d{4}-\d{2}$/.test(e.month) ? ` in ${MONTHS[Number(e.month.slice(5)) - 1]} ${e.month.slice(0, 4)}` : "";
    return { id: e.id, venue: v.name, named: !!(e.canName && e.client), text: `We hosted ${who}${/s$/i.test(who) ? "'" : "'s"} ${e.title.charAt(0).toLowerCase() + e.title.slice(1)} at ${v.name}${e.space ? ` (${e.space})` : ""}${when}${e.guests ? ` for ${e.guests} guests` : ""}.`, link: e.link || "" };
  }
  return null;
}
