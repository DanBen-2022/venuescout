import { getJson, setJson } from "@/lib/keys";

// Other New York venues whose clients Scout should know about. Their websites and press name the
// companies and organizations that held events there; Scout rates those as prospects for smaller
// events around them (host committee dinners, VIP receptions, after-parties, team and client events)
// and watches the news for new events at each venue. Managers edit this in Settings › Competitor venues.
export type CompClient = { id: string; name: string; event: string; guests: number; market: string; source: string };
export type Competitor = { id: string; name: string; website: string; address: string; capacity: string; notes: string; on: boolean; clients: CompClient[] };

const GH = "https://www.theglasshouses.com";
const c = (id: string, name: string, event: string, market: string, guests = 0, page = "/"): CompClient =>
  ({ id, name, event, guests, market, source: GH + page });

// Read from theglasshouses.com (home, galas, conferences, experiential, press) on 2026-11-10.
// Private parties (birthdays, bat mitzvahs, weddings) are left out on purpose.
export const DEFAULT_COMPETITORS: Competitor[] = [
  {
    id: "glasshouse", name: "The Glasshouse", website: GH, address: "660 12th Ave, New York, NY 10019",
    capacity: "Up to 1,850 guests; The Suite 1,380 cocktail, The Studio 1,050 cocktail",
    notes: "Large-format venue on the West Side Highway. Sister venues GH On The Park and GH Chelsea. Their client list is their own marketing.",
    on: true,
    clients: [
      c("gh-toigo", "Robert Toigo Foundation", "Gala", "nonprofit", 1050, "/galas"),
      c("gh-bestfriends", "Best Friends Animal Society", "Gala", "nonprofit", 400, "/galas"),
      c("gh-cmom", "Children's Museum of Manhattan", "Annual gala", "nonprofit", 550, "/galas"),
      c("gh-apatt", "A Place At The Table", "Gala", "nonprofit", 1300, "/galas"),
      c("gh-studiomuseum", "Studio Museum in Harlem", "Gala", "nonprofit", 790, "/galas"),
      c("gh-bcrf", "Breast Cancer Research Foundation", "Hot Pink Gala 2024 and 2025", "nonprofit", 0, "/press"),
      c("gh-fit", "Fashion Institute of Technology", "Annual gala and fashion show", "nonprofit", 0, "/press"),
      c("gh-rebny", "Real Estate Board of New York", "129th Annual Gala", "professional", 0, "/press"),
      c("gh-michelin", "Michelin Guide", "Michelin Awards Gala", "luxury", 0, "/press"),
      c("gh-ldf", "NAACP Legal Defense Fund", "NEJAD event", "nonprofit", 0, "/press"),
      c("gh-robinhood", "Robin Hood", "Event", "nonprofit", 0, "/"),
      c("gh-nokidhungry", "Share Our Strength (No Kid Hungry)", "Benefit", "nonprofit", 0, "/"),
      c("gh-fsf", "Fashion Scholarship Fund", "Event", "nonprofit", 0, "/"),
      c("gh-lambda", "Lambda Legal", "Event", "nonprofit", 0, "/"),
      c("gh-adcouncil", "Ad Council", "Event", "nonprofit", 0, "/"),
      c("gh-sakhi", "Sakhi for South Asian Survivors", "Event", "nonprofit", 0, "/"),
      c("gh-scuola", "La Scuola d'Italia", "Event", "nonprofit", 0, "/"),
      c("gh-northeastern", "Northeastern University", "Reception", "nonprofit", 0, "/"),
      c("gh-lim", "LIM College", "Fashion show", "nonprofit", 0, "/press"),
      c("gh-arista", "Arista Networks", "Conference", "tech", 500, "/conferences"),
      c("gh-navan", "Navan", "Customer conference", "tech", 420, "/conferences"),
      c("gh-skift", "Skift", "Conference", "tech", 750, "/conferences"),
      c("gh-iconnections", "iConnections", "Expo (with SALT)", "finance", 1000, "/conferences"),
      c("gh-nespresso", "Nespresso", "Conference", "luxury", 250, "/conferences"),
      c("gh-capgemini", "Capgemini", "Event", "professional", 0, "/"),
      c("gh-bose", "Bose", "Product launch", "tech", 0, "/"),
      c("gh-tubi", "Tubi", "NewFront", "tech", 0, "/"),
      c("gh-telemundo", "Telemundo", "Upfront 2023", "tech", 900, "/experiential"),
      c("gh-wsj", "The Wall Street Journal", "Future of Everything Festival", "tech", 0, "/press"),
      c("gh-berje", "Berjé", "75th anniversary", "luxury", 0, "/"),
      c("gh-sistas", "Sistas in Sales", "Conference", "professional", 0, "/"),
      c("gh-cowan", "Christian Cowan", "Fashion show", "luxury", 300, "/experiential"),
      c("gh-harlemart", "Harlem Fine Arts Show", "Art show", "entertainment", 1000, "/experiential"),
      c("gh-sowsummit", "Strength of a Woman Summit", "Summit", "entertainment", 0, "/press"),
      c("gh-bizbash", "BizBash", "Industry event", "planners", 0, "/"),
      c("gh-tessler", "Tessler Events", "Weddings (planner)", "planners", 0, "/stories"),
    ],
  },
];

export async function getCompetitors(): Promise<Competitor[]> {
  const saved = await getJson<Competitor[]>("competitor_venues");
  return Array.isArray(saved) ? saved : DEFAULT_COMPETITORS;
}
export const saveCompetitors = (list: Competitor[]) => setJson("competitor_venues", list);
