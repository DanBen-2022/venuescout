import { getJson, setJson } from "@/lib/keys";

// The venues Scout sells, and the offers it may pitch. Managers edit this in Settings › Venues and offers.
export type Venue = {
  id: string; name: string; company: string; location: string; style: string;
  seated: number; standing: number; about: string; spaces: string; packages: string; bestFor: string[]; contact: string;
};
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
    },
    {
      id: "hudsonlocal", name: "Hudson Local", company: HUDSON, location: "Ink48 Hotel, Hell's Kitchen", style: "Upscale", seated: 93, standing: 0,
      about: "Upscale restaurant and lounge with a 93-seat cabaret room for performances, screenings and hosted dinners.",
      spaces: "Cabaret room (93 seated)", packages: "", bestFor: ["entertainment", "luxury", "professional", "social"], contact: "privateevents@hudsonvunyc.com",
    },
    {
      id: "greenfig", name: "Green Fig", company: FIG, location: "YOTEL New York, Times Square West", style: "Casual", seated: 0, standing: 0,
      about: "Relaxed restaurant and bar at YOTEL New York for team events, happy hours, receptions and conference after-parties.",
      spaces: "", packages: "", bestFor: ["tech", "tradeshow", "nonprofit", "planners"], contact: "",
    },
    {
      id: "sdf", name: "Social Drink and Food", company: FIG, location: "YOTEL New York, Times Square West", style: "Casual", seated: 0, standing: 0,
      about: "Casual bar and terrace at YOTEL New York for networking receptions, happy hours and large mingles.",
      spaces: "Tented West\nMiddle\nPurple Lounge (check-in overflow)", packages: "", bestFor: ["tech", "tradeshow", "planners"], contact: "",
    },
    {
      id: "gr42", name: "The Green Room 42", company: FIG, location: "YOTEL New York, Times Square West", style: "Modern upscale", seated: 155, standing: 0,
      about: "Modern upscale 155-seat cabaret room with a full stage, sound and lighting, for shows, launches, award nights and hosted performances.",
      spaces: "Cabaret room (155 seated)", packages: "", bestFor: ["entertainment", "tech", "nonprofit", "social"], contact: "",
    },
  ],
  offers: [
    { id: "o-holiday", title: "Holiday parties", venueIds: ["hudsonvu", "greenfig", "sdf", "gr42"], from: "11-01", to: "01-15", details: "Draft: edit details and turn on.", priceFrom: "", on: false },
    { id: "o-summer", title: "Summer on the rooftop", venueIds: ["hudsonvu"], from: "05-15", to: "09-30", details: "Draft: edit details and turn on.", priceFrom: "", on: false },
  ],
};

export async function getCatalog(): Promise<Catalog> {
  const c = await getJson<Catalog>("venue_catalog");
  return c && Array.isArray(c.venues) ? { venues: c.venues, offers: Array.isArray(c.offers) ? c.offers : [] } : DEFAULT_CATALOG;
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
    (v.spaces ? ` Spaces: ${v.spaces.replace(/\n/g, "; ")}.` : "") + (v.packages ? ` Packages: ${v.packages.replace(/\n/g, "; ")}.` : "")).join("\n");
  const name = (id: string) => c.venues.find((v) => v.id === id)?.name || id;
  const offers = upcomingOffers(c).map((o) => `- "${o.title}" at ${o.venueIds.map(name).join(", ")}, ${prettyMd(o.from)} to ${prettyMd(o.to)}${o.priceFrom ? `, from ${o.priceFrom}` : ""}: ${o.details}`).join("\n");
  return `Our venues:\n${venues}\n` + (offers ? `Seasonal offers in season now or soon (pitch one only if its dates fit the event):\n${offers}\n` : "No seasonal offers are running; don't invent one.\n");
}
