# VenueScout

Lead generation for a luxury private event venue in New York: prospects across ten markets
(trade show exhibitors at Javits are market 6), 1–5 scoring, qualified buyer rules, trade show
calendar, budget and ROI tracking, and a targeting plan, with team logins.

## How it fits together

- **Next.js** (App Router) on Vercel. Sign-in, setup, invite and team pages live in `app/`.
- **Postgres** (Neon via Vercel). Tables are created automatically on first request
  (`lib/db.ts`), and the 2027 Javits show calendar (`data/shows.json`) is loaded once.
- **The VenueScout console** is `public/app.html`. It talks to the API through
  `public/vs-shim.js`, which polls `/api/all` and writes to `/api/c/<list>/<id>`.
- **Apollo connector**: Owners and Managers paste an Apollo API key in Settings › Integrations
  (stored server-side in the `meta` table, never sent to the browser). In a prospect,
  *Find with Apollo* searches people with event titles at the company (`/api/apollo/search`,
  no credits) and *Add* gets their work email (`/api/apollo/reveal`, about 1 credit each).
  UI: `public/vs-apollo.js`.

## Roles

| Role | Can do |
| --- | --- |
| Owner | Everything, including the team |
| Manager | All prospects, markets, shows, budget and ROI; invite Managers and Sales; manage Sales |
| Sales | Their own and unassigned prospects; read markets and shows; no budget or spend |

## Environment

See `.env.example`: `DATABASE_URL`, `AUTH_SECRET`, `SETUP_TOKEN`. Optional: `APOLLO_API_KEY`
(used if no key is saved in Settings).

## First run

Live at https://venuescouthq.com (Vercel project `venuescout`, Neon database connected through Vercel Storage).


1. Open the site; with no users it sends you to `/setup`.
2. Enter the setup code (`SETUP_TOKEN`) to create the Owner account.
3. Invite teammates from **Team**; each invite is a one-time link valid for 14 days.
