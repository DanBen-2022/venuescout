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
  *Fill from Apollo* looks up the company (`/api/apollo/company`, about 1 credit) and stores
  industry, size, HQ and a suggested market on `lead.org`; Settings can fill all unfiled prospects at once.
  UI: `public/vs-apollo.js`.

## Scout (research assistant, Phase 1)

Each night (Vercel Cron, `vercel.json`, 09:00 UTC) `/api/scout/run` runs every active market in parallel
(`lib/scout.ts`). Per market it gathers candidates from an Apollo company search (NYC, the market's industries,
about 1 Apollo credit), Google Places (local partners), and Perplexity news searches read by a small Claude model
(Grok X search too, when turned on). It drops duplicates and companies it has already rated, checks Tripleseat
for past clients, runs a quick Perplexity news check, rates the rest with Claude, and files the best as unassigned
prospects with `foundBy: "scout"` and a `scout` block (score, why-now note, sources, pending/kept/rejected).
Reps keep or reject them on Today; reject reasons feed the next night's rating. Scout never emails anyone and
never buys Apollo emails. Settings › Scout holds the markets, per-night limit, minimum rating and a monthly
budget (estimated tool spend is logged in `scout_runs`). Keys for Perplexity, Google Places and Grok are
pasted in Settings › Integrations (`/api/integrations/<name>`). Set a `CRON_SECRET` env var to lock the cron route; without it only Vercel's cron agent can start it, at most once per 20 hours.

## Roles

| Role | Can do |
| --- | --- |
| Owner | Everything, including the team |
| Manager | All prospects, markets, shows, budget and ROI; invite Managers and Sales; manage Sales |
| Sales | Their own and unassigned prospects; read markets and shows; no budget or spend |

## Environment

- **Sign in with Google**: the Owner pastes a Google OAuth Client ID and Secret on the Team page (or sets
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`). Redirect URI: `https://<host>/api/auth/google/callback`.
  Only existing team members, or people with a pending invite for the same email, can sign in with Google.

See `.env.example`: `DATABASE_URL`, `AUTH_SECRET`, `SETUP_TOKEN`. Optional: `APOLLO_API_KEY`
(used if no key is saved in Settings).

## First run

Live at https://venuescouthq.com (Vercel project `venuescout`, Neon database connected through Vercel Storage).


1. Open the site; with no users it sends you to `/setup`.
2. Enter the setup code (`SETUP_TOKEN`) to create the Owner account.
3. Invite teammates from **Team**; each invite is a one-time link valid for 14 days.
