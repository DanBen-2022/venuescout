// Help tab: a slide deck that explains how VenueScout works. Content only, no data calls.
(function () {
  const box = document.getElementById("helpBox");
  if (!box) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Each slide: section label, title, one-line summary, points [label, text], optional link [label, hash], optional note.
  const SLIDES = [
    { k: "Welcome", t: "How VenueScout works",
      p: "VenueScout finds companies likely to book a private event, tells you who to call first, and tracks what the effort returns.",
      steps: ["Find", "Qualify", "Reach out", "Book", "Measure"],
      pts: [
        ["Find", "Prospects come from trade shows, imported lists, planners, Tripleseat inquiries and Scout's nightly research."],
        ["Qualify", "Every prospect gets a 1 to 5 rating. Qualified buyers rise to the top."],
        ["Reach out", "Find the right person, draft the email, and move the prospect through its stages."],
        ["Measure", "Results shows spend, pipeline and return."],
      ],
      note: "Use the arrows, the dots below, or the left and right keys to move through this guide." },

    { k: "Today", t: "Start every day on Today", link: ["Open Today", "today"],
      p: "Today is your to-do list. It reads your prospects and the show calendar and puts the next best actions in order.",
      pts: [
        ["Found by Scout", "New companies Scout filed overnight, split into past clients and new companies. Keep or Reject each one."],
        ["Call first", "Qualified buyers with a decision maker on file that nobody has contacted yet. Soonest events first."],
        ["Follow up", "Prospects that have sat in Contacted, Meeting set or Proposal sent for 7 days or more."],
        ["Find the decision maker", "Prospects rated 4 or 5 with no decision maker yet."],
        ["Needs a market", "Prospects not filed under a market. Add the website or use Fill from Apollo."],
        ["Show weeks to pitch now", "Trade shows starting in the next 4 months, with a shortcut to import their exhibitors."],
      ] },

    { k: "Prospects", t: "Prospects is your full list", link: ["Open Prospects", "prospects"],
      p: "Every company you might sell to, in one table you can search, filter and sort.",
      pts: [
        ["Rating", "A 1 to 5 score from past events, event size and budget. Owners and Managers set the bands in Settings."],
        ["Qualified buyer", "Meets the minimum rating and has an event 1 to 12 months out."],
        ["Filters", "Market, source (a show, Tripleseat inquiries, Found by Scout, competitor venues), owner, type, rating and priority."],
        ["Stages", "New, Researching, Contacted, Meeting set, Proposal sent, then Won, Lost or Not a fit."],
        ["Owner", "Who works the prospect. Sales reps see their own and unassigned prospects."],
      ] },

    { k: "Prospects", t: "Inside a prospect", link: ["Open Prospects", "prospects"],
      p: "Click any company to open its panel. Everything you need to work it is in one place.",
      pts: [
        ["Contacts", "Each person is tagged Decision maker or Event coordinator. Find with Apollo searches for event titles and adds work emails."],
        ["Company details", "Fill from Apollo adds industry, size and a suggested market. It runs on its own when you enter a website."],
        ["Past work with the venue", "Tripleseat shows earlier bookings and who booked. Mark a past client in one click."],
        ["Email drafts", "Each draft is written for the prospect's market. Open in Gmail fills in the recipient, subject and message."],
        ["Scout's note", "For companies Scout found: why now, sources, and the venue, space and offer it suggests."],
      ],
      note: "VenueScout never sends email on its own. You review and send every message from Gmail." },

    { k: "Markets", t: "Ten markets, one playbook each", link: ["Open Markets", "markets"],
      p: "The ten kinds of buyers a luxury private event venue sells to, from finance to planners and agencies.",
      pts: [
        ["Playbook", "The events each market hosts, its peak season, how far ahead it books, the titles to look for and the angle to pitch."],
        ["Its trade shows", "The shows that feed the market. Trade show exhibitors are market 6."],
        ["Its prospects", "Everything filed under the market, ready to work."],
        ["Its return", "Spend and results for that market alone."],
      ],
      note: "A prospect's market is picked by a rep, suggested by Apollo or Tripleseat, or guessed from the industry. A rep's pick always wins." },

    { k: "Lead sources", t: "Where prospects come from", link: ["Open Lead sources", "sources"],
      p: "Four ways to bring new companies in, beyond Scout and Tripleseat.",
      pts: [
        ["Trade shows", "The calendar of Javits and other NYC shows. Rank them 1 to 5, tick Consider first, and tag each to its markets."],
        ["Import a list", "Paste or upload a CSV. Columns match automatically and rows for the same company merge."],
        ["Find exhibitors", "Claude searches the web and reads a show's directory, then you review the list before importing."],
        ["Planners and agencies", "Referral partners who bring events again and again."],
        ["Where to find prospects", "A reference list of free and paid places to look."],
      ] },

    { k: "Scout", t: "Scout, your research assistant", link: ["Open Scout settings", "settings/scout"],
      p: "Scout works overnight so reps start the day with fresh, researched companies. It suggests. People decide.",
      steps: ["Searches", "Checks Tripleseat", "Rates", "Files", "You decide"],
      pts: [
        ["Every night", "Around 4 AM New York time, Scout researches each active market using Apollo, Google Places and Perplexity news."],
        ["Knows your history", "It skips companies already in motion in Tripleseat and sends past clients to the rep who handled them."],
        ["Why now", "Each find arrives with a rating, a dated reason to reach out, sources, and a suggested venue, space and offer."],
        ["Keep or Reject", "Review on Today. Reject reasons teach Scout what to skip next time."],
        ["Competitor venues", "Scout also checks the clients other New York venues name publicly."],
      ],
      note: "Scout never emails anyone and never buys contact emails. Its monthly tool spend is capped in Settings." },

    { k: "Results", t: "Results shows what it all returns", link: ["Open Results", "results"], hideFor: "sales",
      p: "Budget and return for the lead program. Owners and Managers only.",
      pts: [
        ["Log spend", "Record what you spend on lists, tools, ads and events, by market and channel."],
        ["KPIs", "Cost per lead, pipeline value, won revenue and return, worked out from the spend log and your prospects."],
        ["Period", "This month, this quarter, year to date, the last 12 months or all time."],
        ["Budget and targets", "Set the annual budget by category, your margin and the targets to measure against."],
      ],
      note: "The numbers are only as good as the stages and deal values on your prospects, so keep those current." },

    { k: "Settings", t: "Settings: tell VenueScout what you sell", link: ["Open Settings", "settings"],
      p: "Owners and Managers set the rules here. The link is at the top right of every page.",
      pts: [
        ["Qualified buyer criteria", "The rating bands, weights, minimum rating and event window. Changes rescore every prospect at once."],
        ["Venues and offers", "Your venues with their spaces, packages, seasonal offers, media to send and past events. Scout pitches from this list."],
        ["Competitor venues", "Other New York venues and the clients they name."],
        ["Scout", "Which markets it works, how many it files per night, the minimum rating and the monthly budget."],
        ["Integrations", "The apps VenueScout connects to. See the next slide."],
      ] },

    { k: "Settings", t: "Integrations", link: ["Open Integrations", "settings"],
      p: "Connected once by an Owner or Manager, then shared by the whole team.",
      pts: [
        ["Apollo", "Finds event contacts at a company with their work email, and fills in company details and a suggested market."],
        ["Tripleseat", "Read only. Shows past bookings on each prospect, and brings new Tripleseat inquiries into Prospects at 9 AM and 3 PM New York time."],
        ["Gmail", "Open in Gmail on every email draft. You send from your own inbox."],
        ["Claude", "Powers Find exhibitors and Scout's ratings."],
        ["Perplexity and Google Places", "Scout's news and local business research."],
      ],
      note: "VenueScout reads from Tripleseat and never changes anything there." },

    { k: "Team", t: "Who can do what",
      p: "Three roles keep each person's view simple and the numbers private.",
      roles: [
        ["Owner", "Everything, including the team, sign-in setup and all settings."],
        ["Manager", "All prospects, markets, shows, budget and Results. Connects integrations, invites Managers and Sales."],
        ["Sales", "Their own and unassigned prospects. Reads markets and shows. No budget, spend or Results."],
      ],
      pts: [
        ["Team", "Owners and Managers invite people from Team in the top right menu. Each invite link lasts 14 days."],
        ["View as", "Owners and Managers can preview exactly what a teammate sees. Changes are off while previewing."],
        ["Audit log", "A record of who changed what, for Owners and Managers."],
      ] },

    { k: "Routine", t: "A good daily routine", link: ["Go to Today", "today"],
      p: "Ten minutes in the morning keeps the pipeline moving.",
      pts: [
        ["1. Review Scout", "Keep or Reject what it found overnight."],
        ["2. Call first", "Reach out to the qualified buyers at the top of Today."],
        ["3. Follow up", "Clear anything that has waited 7 days."],
        ["4. Update the stage", "Move each prospect as it progresses and add the deal value, so Results stays accurate."],
        ["5. Feed the list", "Once a week, import exhibitors for the next show weeks."],
      ],
      note: "You can come back to this guide any time from the Help tab." },
  ];

  const css = document.createElement("style");
  css.textContent = `
.hdeck{max-width:1040px;margin:0 auto}
.hstage{background:var(--surface);border:1px solid var(--line);border-top:2px solid var(--gold);border-radius:var(--r);padding:clamp(20px,4vw,44px);min-height:590px;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(20px,4vw,48px);align-items:start}
.hstage:focus,.hstage:focus-visible{outline:none}
.hleft{display:flex;flex-direction:column;gap:14px;min-width:0}
.heye{font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);font-weight:600}
.hstage h2{font-size:clamp(28px,4vw,40px);font-weight:500;line-height:1.08;margin:0;letter-spacing:.01em}
.hlede{font-size:16px;line-height:1.5;color:var(--muted);margin:0;max-width:44ch}
.hsteps{display:flex;flex-wrap:wrap;gap:6px 0;align-items:center;margin:4px 0 0;padding:0;list-style:none;font-family:var(--f-display);font-style:italic;font-size:19px}
.hsteps li{white-space:nowrap}
.hsteps li:not(:last-child)::after{content:"";display:inline-block;width:18px;height:1px;background:var(--gold);vertical-align:middle;margin:0 8px}
.hnote{font-size:13px;color:var(--muted);border-left:1px solid var(--gold);padding:2px 0 2px 12px;margin:0;max-width:44ch}
.hleft .btn{align-self:flex-start;margin-top:4px}
.hpts{list-style:none;margin:0;padding:0;min-width:0}
.hpts li{padding:12px 0;border-top:1px solid var(--line);font-size:14px;line-height:1.5}
.hpts li:first-child{border-top:0;padding-top:2px}
.hpts b{display:block;font-family:var(--f-display);font-weight:600;font-size:18px;line-height:1.2;margin-bottom:2px}
.hpts span{color:var(--muted)}
.hroles{display:grid;gap:8px;margin:0 0 14px}
.hrole{border:1px solid var(--line);background:var(--sunk);padding:10px 12px;display:grid;grid-template-columns:86px 1fr;gap:10px;align-items:baseline;font-size:14px;line-height:1.45}
.hrole b{font-family:var(--f-display);font-size:19px;font-weight:600}
.hbar{display:flex;align-items:center;gap:12px;margin-top:14px}
.hdots{display:flex;gap:2px;flex-wrap:wrap;justify-content:center;flex:1}
.hdots button{width:22px;height:22px;border:0;background:none;padding:0;cursor:pointer;display:grid;place-items:center}
.hdots button::before{content:"";width:7px;height:7px;border-radius:50%;border:1px solid var(--s3)}
.hdots button[aria-current="true"]::before{background:var(--gold);border-color:var(--gold)}
.hcount{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;min-width:52px;text-align:center}
.htoc{display:flex;flex-wrap:wrap;gap:4px 16px;justify-content:center;margin:18px 0 0;padding:0;list-style:none;font-size:13px}
.htoc button{font:inherit;color:var(--muted);background:none;border:0;padding:2px 0;cursor:pointer;border-bottom:1px solid transparent}
.htoc button:hover,.htoc button[aria-current="true"]{color:var(--fg);border-bottom-color:var(--gold)}
@media (max-width:760px){.hstage{grid-template-columns:1fr;min-height:0}.hcount{display:none}}
@media print{header,.hbar,.htoc{display:none}}
`;
  document.head.appendChild(css);

  let i = 0;
  const visible = () => SLIDES.filter((s) => !(s.hideFor && document.body.classList.contains("role-" + s.hideFor)));

  function paint(focus) {
    const list = visible();
    i = Math.max(0, Math.min(i, list.length - 1));
    const s = list[i];
    box.innerHTML = `<div class="hdeck">
      <div class="toolbar"><div style="margin-right:auto"><h2 style="font-size:26px">Help</h2><p class="lede" style="margin:0">A short guide to how VenueScout works, one screen at a time.</p></div></div>
      <div class="hstage" id="hStage" tabindex="0" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${list.length}: ${esc(s.t)}">
        <div class="hleft">
          <div class="heye">${String(i + 1).padStart(2, "0")} · ${esc(s.k)}</div>
          <h2>${esc(s.t)}</h2>
          <p class="hlede">${esc(s.p)}</p>
          ${s.steps ? `<ol class="hsteps">${s.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
          ${s.note ? `<p class="hnote">${esc(s.note)}</p>` : ""}
          ${s.link ? `<button class="btn" data-hgo="${esc(s.link[1])}">${esc(s.link[0])}</button>` : ""}
        </div>
        <div>
          ${s.roles ? `<div class="hroles">${s.roles.map(([a, b]) => `<div class="hrole"><b>${esc(a)}</b><span>${esc(b)}</span></div>`).join("")}</div>` : ""}
          <ul class="hpts">${s.pts.map(([a, b]) => `<li><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join("")}</ul>
        </div>
      </div>
      <div class="hbar">
        <button class="btn" data-hstep="-1" ${i === 0 ? "disabled" : ""}>Back</button>
        <div class="hdots">${list.map((x, n) => `<button data-hto="${n}" aria-label="Slide ${n + 1}: ${esc(x.t)}" ${n === i ? 'aria-current="true"' : ""}></button>`).join("")}</div>
        <span class="hcount">${i + 1} of ${list.length}</span>
        <button class="btn primary" data-hstep="1" ${i === list.length - 1 ? "disabled" : ""}>Next</button>
      </div>
      <ul class="htoc">${list.map((x, n) => (n && list[n - 1].k === x.k ? "" : `<li><button data-hto="${n}" ${x.k === s.k ? 'aria-current="true"' : ""}>${esc(x.k)}</button></li>`)).join("")}</ul>
    </div>`;
    if (focus) document.getElementById("hStage").focus({ preventScroll: true });
  }

  box.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.hstep) { i += +t.dataset.hstep; paint(true); }
    else if (t.dataset.hto) { i = +t.dataset.hto; paint(true); }
    else if (t.dataset.hgo) {
      const [tab, anchor] = t.dataset.hgo.split("/");
      location.hash = tab;
      if (anchor) setTimeout(() => { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ block: "start" }); }, 60);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (box.closest("section").hidden || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight" && i < visible().length - 1) { i++; paint(true); }
    else if (e.key === "ArrowLeft" && i > 0) { i--; paint(true); }
  });
  paint(false);
  // The role class is added once the signed-in user loads; repaint so role-only slides drop out.
  (window.VS && window.VS.ready ? window.VS.ready : Promise.resolve()).then(() => paint(false), () => {});
})();
