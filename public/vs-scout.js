/* VenueScout: Scout, the research assistant (Phase 1).
   - Settings: Scout's own section, plus cards for Perplexity, Google Places and Grok.
   - Today: "Found by Scout" with Keep and Reject.
   - Prospect panel: why Scout suggested it, with Keep and Reject.
   Loaded after the main script, which exposes its helpers as window.VSAPP. */
(function () {
  const A = window.VSAPP; if (!A) return;
  const { S, esc, toast, putLead, MK, MARKETS } = A;
  const $ = (id) => document.getElementById(id);
  const st = { scout: null, tools: {}, busy: "", lastSig: "" };
  const REJECT = ["Not in New York", "Too small", "Wrong market", "Not an events buyer", "Already talking to them", "Other"];
  const TOOL_INFO = {
    perplexity: { label: "Perplexity", where: '<a href="https://console.perplexity.ai" target="_blank" rel="noopener">console.perplexity.ai</a> › API keys', ph: "pplx-…",
      on: "Scout uses it for daily news checks: deals, funding, launches, galas and show exhibitors. About $0.005 per search." },
    places: { label: "Google Places", where: '<a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener">Google Cloud › Keys &amp; Credentials</a> (restricted to Places API (New))', ph: "AIza…",
      on: "Scout uses it to list local partners by neighborhood: planners, synagogue event offices, florists, hotels. The first 5,000 searches a month are free." },
    grok: { label: "Grok", where: '<a href="https://console.x.ai" target="_blank" rel="noopener">console.x.ai</a> › API keys', ph: "xai-…",
      on: "Reads recent posts on X for fashion, media and entertainment news. Built and ready, but only used while it's turned on." },
  };
  document.head.insertAdjacentHTML("beforeend", `<style>
    .scoutrow{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;padding:12px 0;border-top:1px solid var(--line)}
    .scoutrow:first-of-type{border-top:0}
    .scoutrow .why{margin:4px 0 0}
    .scoutrow .acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .scoutrow select{width:auto;font-size:13px;padding:4px 6px}
    .scoutsrc a{margin-right:10px}
    .mkpick{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 16px;margin:6px 0 10px}
    .mkpick label{display:flex;gap:8px;align-items:center;font-size:14px}
    .scoutgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px 16px;margin:8px 0}
    .runs td{font-size:13px;vertical-align:top}
    @media (max-width:640px){.scoutrow{grid-template-columns:1fr}.scoutrow .acts{justify-content:flex-start}}
  </style>`);
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { if (window.VS && window.VS.toLogin) window.VS.toLogin(); else location.href = "/login"; throw new Error("Please sign in."); }
    if (!r.ok) throw new Error(j.error || (r.status === 504 ? "Scout took too long. Try one market at a time." : "Something went wrong."));
    return j;
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const mname = (id) => (MK[id] ? MK[id].short : id);
  const usd = (n) => "$" + (Number(n) || 0).toFixed(n >= 100 ? 0 : 2);
  const when = (s) => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };

  // ---------- Keep and reject ----------
  const pending = () => [...S.leads.values()].filter((l) => l.foundBy === "scout" && l.scout && l.scout.status === "pending");
  function review(id, keep, reason) {
    const l = S.leads.get(id); if (!l || !l.scout) return;
    const me = window.VS && window.VS.me;
    const n = JSON.parse(JSON.stringify(l));
    n.scout.status = keep ? "kept" : "rejected";
    n.scout.reviewedBy = me ? me.name : ""; n.scout.reviewedAt = new Date().toISOString();
    n.statusDates = n.statusDates || {};
    if (keep) {
      if (!n.owner && me) n.owner = me.id;
      if (!n.status || n.status === "New") { n.status = "Researching"; n.statusDates.Researching = today(); }
    } else {
      n.scout.rejectReason = reason || "Other";
      n.status = "Not a fit"; n.statusDates["Not a fit"] = today();
    }
    putLead(n);
    const forOther = keep && n.owner && me && n.owner !== me.id;
    const ownerName = forOther && window.VS && window.VS.ownerName ? window.VS.ownerName(n.owner) : "";
    toast(keep ? (forOther ? `Kept ${l.company} for ${ownerName || "its rep"}.` : `Kept ${l.company}. It's yours now.`) : `Rejected ${l.company}. Scout will learn from that.`);
    paintToday(true); paintDrawer();
  }

  function rowHtml(l, inDrawer) {
    const s = l.scout || {};
    const src = (s.sources || []).filter((x) => /^https?:\/\//.test(x.url || "")).slice(0, 3);
    const routed = s.routedTo && window.VS && window.VS.ownerName ? window.VS.ownerName(s.routedTo) : "";
    const flags = [s.pastClient ? '<span class="chip ok">Past client</span>' : s.inTripleseat ? '<span class="chip">Past inquiry</span>' : "",
      routed ? `<span class="chip q">For ${esc(routed)}</span>` : s.handoff ? '<span class="chip q">Rep should lead</span>' : ""].join(" ");
    const le = s.lastEvent;
    const lastLine = le ? `<p class="sub" style="margin:2px 0 0">Last event: ${esc(le.name || "event")}, ${esc(le.date)}${le.total ? ` · ${esc("$" + Number(le.total).toLocaleString("en-US"))}` : ""}${s.tsOwner ? ` · handled by ${esc(s.tsOwner)}` : ""}</p>`
      : s.tsOwner ? `<p class="sub" style="margin:2px 0 0">Tripleseat account owner: ${esc(s.tsOwner)}</p>` : "";
    return `<div class="scoutrow" data-scoutid="${esc(l.id)}">
      ${inDrawer ? "" : `<span class="rate r${Math.round(s.score || 1)}" title="Scout's rating">${Math.round(s.score || 1)}</span>`}
      <div>${inDrawer ? "" : `<button class="linkish co" data-scoutopen="${esc(l.id)}">${esc(l.company)}</button> <span class="sub">${esc(mname(l.market))}</span> `}${flags}
        <p class="why">${esc(s.whyNow || "")}</p>
        ${lastLine}
        ${s.eventIdea ? `<p class="sub" style="margin:2px 0 0">Pitch: ${esc(s.eventIdea)}${s.venue ? ` · <b>${esc(s.venue)}</b>${s.space ? ", " + esc(s.space) : ""}` : ""}${s.offer ? ` · <span class="chip ok" title="Seasonal offer">${esc(s.offer)}</span>` : ""}${s.estValue ? ` · about ${esc("$" + Number(s.estValue).toLocaleString("en-US"))}` : ""}</p>` : ""}
        ${src.length ? `<p class="sub scoutsrc" style="margin:2px 0 0">${src.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc((x.title || "Source").slice(0, 50))} ↗</a>`).join("")}</p>` : ""}
        ${inDrawer && s.reason ? `<p class="sub" style="margin:2px 0 0">Scout's rating ${esc(String(s.score))}: ${esc(s.reason)}</p>` : ""}</div>
      <div class="acts">${s.status === "pending" ? `<button class="btn primary" data-scoutkeep="${esc(l.id)}">Keep</button>
        <select data-scoutwhy="${esc(l.id)}" aria-label="Why reject"><option value="">Reject because…</option>${REJECT.map((r) => `<option>${esc(r)}</option>`).join("")}</select>`
        : `<span class="chip ${s.status === "kept" ? "ok" : ""}">${s.status === "kept" ? "Kept" : "Rejected"}${s.reviewedBy ? " by " + esc(s.reviewedBy) : ""}</span>`}</div></div>`;
  }

  // ---------- Today: Found by Scout ----------
  function paintToday(force) {
    const box = $("scoutToday"); if (!box) return;
    const list = pending().sort((a, b) => (b.scout.score || 0) - (a.scout.score || 0));
    const sig = list.map((l) => l.id + l.scout.status).join("|");
    if (!force && sig === st.lastSig && box.dataset.painted) return;
    st.lastSig = sig; box.dataset.painted = "1";
    if (!list.length) { box.innerHTML = ""; return; }
    const isPast = (l) => !!(l.scout.pastClient || l.scout.inTripleseat);
    const shown = [...list.filter(isPast).slice(0, 10), ...list.filter((l) => !isPast(l)).slice(0, 10)];
    const past = shown.filter(isPast), fresh = shown.filter((l) => !isPast(l));
    const group = (title, sub, ls) => !ls.length ? "" : `<h4 class="scoutgrp" style="margin:14px 0 2px;font-size:13px;letter-spacing:.04em;text-transform:uppercase">${esc(title)} <span class="sub" style="text-transform:none;letter-spacing:0">(${ls.length})</span></h4>${sub ? `<p class="sub" style="margin:0 0 4px">${esc(sub)}</p>` : ""}${ls.map((l) => rowHtml(l, false)).join("")}`;
    box.innerHTML = `<div class="sec today" style="margin-bottom:16px"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>Found by Scout</h3><span class="sub">${list.length} to review${list.length > shown.length ? ` · showing ${shown.length}` : ""}</span></div>
      <p class="sub" style="margin:0 0 6px">New prospects Scout found overnight, best first. <b>Keep</b> makes it yours; reject with a reason and Scout learns what to skip. Nothing has been sent to anyone.</p>
      ${group("Past clients with a new reason", "Rep who knows them leads. Shown to the rep who handled their last event, when Scout can match them.", past)}
      ${group("New companies", "", fresh)}</div>`;
  }

  // ---------- Prospect panel ----------
  function paintDrawer() {
    const box = $("scoutBox"); if (!box) return;
    const l = S.open && S.leads.get(S.open);
    if (!l || l.foundBy !== "scout" || !l.scout) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="sec"><h3>Found by Scout</h3>${rowHtml(l, true)}</div>`;
  }

  document.addEventListener("click", (e) => {
    const k = e.target.closest("[data-scoutkeep]"); if (k) { review(k.dataset.scoutkeep, true); return; }
    const o = e.target.closest("[data-scoutopen]"); if (o && A.openDrawer) { A.openDrawer(o.dataset.scoutopen); return; }
  });
  document.addEventListener("change", (e) => {
    const s = e.target.closest && e.target.closest("[data-scoutwhy]");
    if (s && s.value) review(s.dataset.scoutwhy, false, s.value);
  });

  // ---------- Settings: tool cards ----------
  async function refreshTools() {
    await Promise.all(Object.keys(TOOL_INFO).map(async (n) => { try { st.tools[n] = await api("GET", "/api/integrations/" + n); } catch { st.tools[n] = st.tools[n] || {}; } }));
    Object.keys(TOOL_INFO).forEach(paintTool);
  }
  function paintTool(n) {
    const box = $(n + "Ctl"), chip = $(n + "Chip"), t = st.tools[n] || {}, info = TOOL_INFO[n];
    if (!box) return;
    const on = n === "grok" ? t.connected && t.enabled : t.connected;
    if (chip) { chip.textContent = !t.connected ? "Not connected" : n === "grok" && !t.enabled ? "Connected, off" : "Connected"; chip.className = "chip " + (on ? "ok" : "q"); }
    if (t.connected) {
      box.innerHTML = `<p class="sub" style="margin:0 0 8px">${t.source === "env" ? "Connected with a key set on the server." : t.last4 ? `Connected with the key ending in <b>${esc(t.last4)}</b>.` : "Connected."} ${info.on}</p>
        ${t.canEdit ? `<div class="row" style="gap:8px">${n === "grok" ? `<button class="btn ${t.enabled ? "" : "primary"}" data-grokon="${t.enabled ? "0" : "1"}">${t.enabled ? "Turn off" : "Turn on"}</button>` : ""}${t.source !== "env" ? `<button class="btn" data-tooloff="${n}">Disconnect</button>` : ""}</div>` : ""}`;
    } else if (t.canEdit) {
      box.innerHTML = `<p class="sub" style="margin:0 0 8px">${n === "grok" ? "Grok is built but turned off for now. Claude and Perplexity cover these markets until you turn it on. " : ""}Create a key at ${info.where}, then paste it here. It stays on the server; teammates never see it.</p>
        <div class="row" style="gap:8px;flex-wrap:nowrap"><input id="${n}Key" type="password" autocomplete="off" placeholder="${info.ph}" aria-label="${info.label} API key" style="flex:1;min-width:0">
        <button class="btn primary" data-toolon="${n}">Connect</button></div><p class="sub" id="${n}Msg" style="margin:6px 0 0"></p>`;
    } else box.innerHTML = `<p class="sub" style="margin:0">Not connected. Ask an Owner or Manager to connect ${info.label} here.</p>`;
  }
  document.addEventListener("click", async (e) => {
    const on = e.target.closest("[data-toolon]");
    if (on) {
      const n = on.dataset.toolon, inp = $(n + "Key"), msg = $(n + "Msg");
      on.disabled = true; if (msg) msg.textContent = "Checking the key…";
      try { await api("PUT", "/api/integrations/" + n, { key: (inp.value || "").trim() }); toast(TOOL_INFO[n].label + " connected"); await refreshTools(); refreshScout(); }
      catch (err) { if (msg) msg.textContent = err.message; on.disabled = false; }
      return;
    }
    const off = e.target.closest("[data-tooloff]");
    if (off) {
      const n = off.dataset.tooloff;
      if (!confirm(`Disconnect ${TOOL_INFO[n].label}? Scout stops using it.`)) return;
      try { await api("DELETE", "/api/integrations/" + n); toast(TOOL_INFO[n].label + " disconnected"); await refreshTools(); refreshScout(); } catch (err) { toast(err.message); }
      return;
    }
    const g = e.target.closest("[data-grokon]");
    if (g) {
      try { await api("PUT", "/api/integrations/grok", { enabled: g.dataset.grokon === "1" }); toast(g.dataset.grokon === "1" ? "Grok is on for Scout" : "Grok is off"); await refreshTools(); refreshScout(); } catch (err) { toast(err.message); }
    }
  });

  // ---------- Settings: Scout ----------
  async function refreshScout() {
    try { st.scout = await api("GET", "/api/scout"); } catch { /* keep */ }
    paintScout();
  }
  function paintScout() {
    const box = $("scoutCtl"), chip = $("scoutChip"), s = st.scout;
    if (!box || !s) return;
    const c = s.config, t = s.tools;
    if (chip) { chip.textContent = !t.claude ? "Needs Claude" : c.enabled ? "On, runs nightly" : "Off"; chip.className = "chip " + (c.enabled && t.claude ? "ok" : "q"); }
    const tool = (ok, name, why) => `<li>${ok ? "✓" : "○"} <b>${name}</b> <span class="sub">${ok ? why : "not connected"}</span></li>`;
    const ro = !s.canEdit ? "disabled" : "";
    box.innerHTML = `
      <p style="margin:0 0 8px">Each night around 4 or 5 AM New York time, Scout looks for new companies in the markets you pick and checks each one for free first: duplicates, your Tripleseat history, and a New York presence. It then rates them with a small Claude model and files the best as unassigned prospects marked <b>Found by Scout</b>, with a short why-now note. Reps keep or reject them on Today. Scout never emails anyone, and it only finds names and titles, so no Apollo email credits are spent until a rep asks.</p>
      <ul style="margin:0 0 10px;padding-left:0;list-style:none;columns:2;column-gap:24px">
        ${tool(t.claude, "Claude", "rates and writes the notes")}${tool(t.apollo, "Apollo", "finds NYC companies and contacts")}
        ${tool(t.perplexity, "Perplexity", "news and why-now checks")}${tool(t.places, "Google Places", "local partners")}
        ${tool(t.tripleseat, "Tripleseat", "past clients")}${tool(t.grok, "Grok", "X posts (optional)")}
      </ul>
      <label class="row" style="gap:8px;font-weight:600"><input type="checkbox" id="scOn" style="width:auto;margin:0" ${c.enabled ? "checked" : ""} ${ro}> Scout runs every night</label>
      <p class="sub" style="margin:10px 0 0">Markets Scout works on</p>
      <div class="mkpick">${MARKETS.map((m, i) => `<label><input type="checkbox" style="width:auto;margin:0" data-scmk="${m.id}" ${c.markets.includes(m.id) ? "checked" : ""} ${ro}> ${i + 1}. ${esc(m.short)}</label>`).join("")}</div>
      <div class="scoutgrid">
        <label class="f">New prospects per market each night<input id="scPer" type="number" min="1" max="25" value="${c.perMarket}" ${ro}></label>
        <label class="f">Lowest Scout rating to file (1–5)<input id="scMin" type="number" min="1" max="5" step="0.5" value="${c.minScore}" ${ro}></label>
        <label class="f">Monthly tool budget ($)<input id="scCap" type="number" min="0" step="10" value="${c.monthlyCap}" ${ro}></label>
        <label class="f">Rep leads deals worth over ($)<input id="scHand" type="number" min="0" step="1000" value="${c.handoff}" ${ro}></label>
      </div>
      <p class="sub" style="margin:0 0 8px">Spent this month: <b>${usd(s.spent)}</b> of ${usd(c.monthlyCap)} on Claude, Perplexity, Places and Grok (estimated). Scout stops for the month when it reaches the budget. Apollo company searches use about 1 Apollo credit per market per night.</p>
      ${s.canEdit ? `<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><button class="btn primary" id="scSave">Save</button>
        <span class="sub" style="margin-left:8px">Run now:</span><select id="scRunMk" style="width:auto">${c.markets.map((m) => `<option value="${m}">${esc(mname(m))}</option>`).join("")}</select>
        <button class="btn" id="scRun" ${st.busy || !t.claude ? "disabled" : ""}>${st.busy ? '<span class="spin" aria-hidden="true"></span> ' + esc(st.busy) : "Run Scout"}</button></div>
        <p class="sub" id="scMsg" style="margin:6px 0 0"></p>` : ""}
      ${runsHtml(s.runs)}`;
  }
  function runsHtml(runs) {
    if (!runs || !runs.length) return '<p class="sub" style="margin:12px 0 0">No runs yet. The first nightly run happens tonight, or use Run Scout above.</p>';
    return `<h4 style="margin:16px 0 6px">Recent runs</h4><div class="tablebox"><table class="small runs"><thead><tr><th>When</th><th>Market</th><th class="num">Looked at</th><th class="num">Filed</th><th class="num">Cost</th><th>Notes</th></tr></thead><tbody>
      ${runs.slice(0, 12).map((r) => `<tr><td>${esc(when(r.at))}<div class="sub">${r.trigger === "cron" ? "Nightly" : esc(r.by_name || "Run now")}</div></td><td>${esc(mname(r.market))}</td>
        <td class="num">${r.found}</td><td class="num">${r.saved}</td><td class="num">${usd(r.cost)}</td>
        <td>${r.error ? `<span style="color:var(--bad)">${esc(r.error)}</span>` : ""}<div class="sub">${esc((r.notes || []).slice(-2).join(" · "))}</div></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  document.addEventListener("click", async (e) => {
    if (e.target.closest("#scSave")) {
      const markets = [...document.querySelectorAll("[data-scmk]")].filter((x) => x.checked).map((x) => x.dataset.scmk);
      try {
        await api("PUT", "/api/scout", { enabled: $("scOn").checked, markets, perMarket: $("scPer").value, minScore: $("scMin").value, monthlyCap: $("scCap").value, handoff: $("scHand").value });
        toast("Scout settings saved"); refreshScout();
      } catch (err) { $("scMsg").textContent = err.message; }
      return;
    }
    if (e.target.closest("#scRun")) {
      const market = $("scRunMk").value; if (!market) return;
      const t0 = Date.now();
      st.busy = `Working on ${mname(market)}…`; paintScout();
      const tick = setInterval(() => { st.busy = `Working on ${mname(market)}… ${Math.round((Date.now() - t0) / 1000)}s`; const b = $("scRun"); if (b) b.innerHTML = '<span class="spin" aria-hidden="true"></span> ' + esc(st.busy); }, 1000);
      try {
        const r = await api("POST", "/api/scout/run", { market });
        const x = (r.results || [])[0] || {};
        toast(x.skipped || x.error || `Scout looked at ${x.found} companies and filed ${x.saved}.`);
        if (window.VS && window.VS.refresh) window.VS.refresh();
      } catch (err) { toast(err.message); }
      clearInterval(tick); st.busy = ""; refreshScout();
    }
  });

  // Repaint Today when prospects change, and the panel when it opens.
  setInterval(() => { if (S.loaded !== false) paintToday(false); }, 1500);
  new MutationObserver(() => { const b = $("scoutBox"); if (b && !b.dataset.painted) { b.dataset.painted = "1"; paintDrawer(); } })
    .observe(document.getElementById("drawerRoot"), { childList: true });
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#settings")) { refreshTools(); refreshScout(); } });
  refreshTools(); refreshScout(); paintToday(true);
})();
