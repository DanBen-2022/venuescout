/* VenueScout: Apollo.io connector UI (Settings card + "Find with Apollo" in the prospect drawer).
   Loaded after the main script, which exposes the helpers it needs as window.VSAPP. */
(function () {
  const A = window.VSAPP; if (!A) return;
  const { S, esc, toast, readDrawer, draftLead, renderContacts, refreshDrawerScore, scheduleSave, roleFor, putLead, guessMarket, marketOf, MK, MARKETS } = A;
  const st = { connected: false, canEdit: false, last4: null, source: null, results: null, busy: false };
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { if (window.VS && window.VS.toLogin) window.VS.toLogin(); else location.href = "/login"; throw new Error("Please sign in."); }
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  };

  async function refresh() {
    try { Object.assign(st, await api("GET", "/api/apollo")); } catch { /* leave as is */ }
    document.body.classList.toggle("apollo-on", st.connected);
    paintCard();
  }

  function paintCard() {
    const box = document.getElementById("apolloCtl"); const chip = document.getElementById("apolloChip");
    if (!box) return;
    if (chip) { chip.textContent = st.connected ? "Connected" : "Not connected"; chip.className = "chip " + (st.connected ? "ok" : "q"); }
    if (st.connected) {
      box.innerHTML = `<p class="sub" style="margin:0 0 8px">${st.source === "env" ? "Connected with a key set on the server." : st.last4 ? "Connected with the key ending in <b>" + esc(st.last4) + "</b>." : "Connected."}
        Open any prospect and use <b>Find with Apollo</b> next to Add person, or <b>Fill from Apollo</b> for the company's details.</p>
        ${st.canEdit ? bulkHtml() : ""}
        ${st.canEdit && st.source !== "env" ? '<button class="btn" id="apolloDisconnect">Disconnect</button>' : ""}`;
    } else if (st.canEdit) {
      box.innerHTML = `<p class="sub" style="margin:0 0 8px">In Apollo, go to Settings › Integrations › API, create a key with <b>Set as master key</b> turned on, and paste it here. The key stays on the server; teammates never see it.</p>
        <div class="row" style="gap:8px;flex-wrap:nowrap"><input id="apolloKey" type="password" autocomplete="off" placeholder="Apollo API key" aria-label="Apollo API key" style="flex:1;min-width:0">
        <button class="btn primary" id="apolloConnect">Connect</button></div><p class="sub" id="apolloMsg" style="margin:6px 0 0"></p>`;
    } else {
      box.innerHTML = '<p class="sub" style="margin:0">Not connected. Ask an Owner or Manager to connect Apollo here.</p>';
    }
  }

  document.addEventListener("click", async (e) => {
    const t = e.target;
    if (t.id === "apolloConnect") {
      const key = document.getElementById("apolloKey").value.trim(); const msg = document.getElementById("apolloMsg");
      t.disabled = true; msg.textContent = "Checking the key with Apollo…";
      try { const r = await api("PUT", "/api/apollo", { key }); await refresh(); toast(r.warning ? "Saved with a warning" : "Apollo connected");
        if (r.warning) { const b = document.getElementById("apolloCtl"); b.insertAdjacentHTML("beforeend", `<p class="sub" style="margin:8px 0 0;color:var(--warn,#9a5b00)">${esc(r.warning)}</p>`); } }
      catch (err) { msg.textContent = err.message; t.disabled = false; }
    }
    if (t.id === "apolloDisconnect") {
      if (!t.dataset.armed) { t.dataset.armed = "1"; t.textContent = "Click again to disconnect"; return; }
      try { await api("DELETE", "/api/apollo"); await refresh(); toast("Apollo disconnected"); } catch (err) { toast(err.message); }
    }
    if (t.id === "apolloFind") find({ broad: false, near: true });
    if (t.id === "apolloBroad") find({ broad: true, near: st.results ? st.results.near : true });
    if (t.id === "apolloEvents") find({ broad: false, near: st.results && !["name", "email"].includes(st.results.mode) ? st.results.near : true });
    if (t.id === "apolloWhere") find({ broad: st.results?.mode === "senior" && st.results?.broad, near: !st.results?.near });
    if (t.id === "apolloMore") more(t);
    if (t.id === "apolloClose") { st.results = null; paintResults(); }
    if (t.id === "apolloOrgFill") fillOpen(false);
    if (t.id === "apolloBulk") bulk(t);
    if (t.id === "apolloBulkStop") bulkState.stop = true;
    const add = t.closest && t.closest("[data-apadd]"); if (add) addPerson(add.dataset.apadd, add);
  });

  async function find(q) {
    if (st.busy || !S.open) return;
    const l = readDrawer(); const box = document.getElementById("apolloBox"); if (!box) return;
    st.busy = true; st.results = null;
    box.innerHTML = `<div class="sec apbox"><p class="sub" style="margin:0">Searching Apollo for ${q.name ? esc(q.name) + " at " : "people at "}${esc(l.company)}…</p></div>`;
    try { st.results = await api("POST", "/api/apollo/search", { company: l.company, website: l.website, broad: q.broad, near: q.near, name: q.name || "" }); st.results.leadId = l.id; st.results.broad = q.broad; st.results.q = q.name || ""; }
    catch (err) { box.innerHTML = `<div class="sec apbox"><div class="row" style="justify-content:space-between"><p style="margin:0">${esc(err.message)}</p><button class="btn ghost" id="apolloClose">Close</button></div>${qForm(q.name || "")}</div>`; }
    finally { st.busy = false; }
    if (st.results) paintResults();
  }

  const qForm = (v) => `<form id="apolloQForm" class="row" style="gap:8px;margin:8px 0;flex-wrap:nowrap"><input id="apolloQ" value="${esc(v)}" placeholder="Search Apollo by name or email" aria-label="Search Apollo by name or email" style="flex:1;min-width:0"><button class="btn">Search</button></form>`;
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "apolloQForm") return; e.preventDefault();
    const v = document.getElementById("apolloQ").value.trim(); if (!v) return find({ broad: false, near: true });
    if (v.includes("@")) byEmail(v); else find({ broad: false, near: false, name: v });
  });
  async function byEmail(email) {
    if (st.busy || !S.open) return;
    const l = readDrawer(); const box = document.getElementById("apolloBox"); if (!box) return;
    st.busy = true;
    box.innerHTML = `<div class="sec apbox"><p class="sub" style="margin:0">Looking up ${esc(email)} in Apollo…</p></div>`;
    try {
      const p = await api("POST", "/api/apollo/reveal", { email });
      const id = p.id || "email:" + email;
      st.results = { leadId: l.id, mode: "email", q: email, domain: (p.website || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""), org: { name: p.company }, page: 1, total: 1, near: false,
        people: [{ id, name: p.name, title: p.title, hasEmail: !!p.email }], revealed: { [id]: p } };
    } catch (err) {
      st.results = null;
      box.innerHTML = `<div class="sec apbox"><div class="row" style="justify-content:space-between"><p style="margin:0">${esc(err.message)}</p><button class="btn ghost" id="apolloClose">Close</button></div>${qForm(email)}</div>`;
    } finally { st.busy = false; }
    if (st.results) paintResults();
  }

  async function more(btn) {
    const r = st.results; if (!r || st.busy) return;
    st.busy = true; btn.disabled = true; btn.textContent = "Loading…";
    try {
      const n = await api("POST", "/api/apollo/search", { website: "https://" + r.domain, page: r.page + 1, mode: r.mode, near: r.near, name: r.q || "" });
      if (st.results !== r) return;
      const ids = new Set(r.people.map((p) => p.id));
      r.people.push(...n.people.filter((p) => !ids.has(p.id)));
      r.page = n.page; if (!n.people.length) r.total = r.people.length;
    } catch (err) { toast(err.message); }
    finally { st.busy = false; }
    paintResults();
  }

  function paintResults() {
    const box = document.getElementById("apolloBox"); if (!box) return;
    const r = st.results; if (!r || r.leadId !== S.open) { box.innerHTML = ""; return; }
    const l = draftLead();
    const rows = r.people.map((p) => {
      const added = (l.contacts || []).some((c) => c.apolloId === p.id);
      return `<li class="aprow"><span><b>${esc(p.name)}</b><div class="sub">${esc(p.title || "No title")}${p.hasEmail ? " · email available" : " · no email on file"}</div></span>
        ${added ? '<span class="chip ok">Added</span>' : `<button class="btn" data-apadd="${esc(p.id)}" ${p.hasEmail ? "" : 'title="Apollo has no email for this person"'}>Add</button>`}</li>`;
    }).join("");
    box.innerHTML = `<div class="sec apbox">
      <div class="row" style="justify-content:space-between;align-items:baseline"><h3 style="margin:0">Apollo: ${esc(r.org?.name || l.company)} <span class="sub">${esc(r.domain)}</span></h3><button class="btn ghost" id="apolloClose">Close</button></div>
      ${qForm(r.q || "")}
      <p class="sub" style="margin:4px 0 8px">${r.mode === "email" ? "Found by email. Add puts them in contacts right away (the lookup already used the credit)." : r.mode === "name" ? `People named “${esc(r.q)}” at this company, from anywhere.` : r.mode === "events" ? "People with event, trade show and marketing titles" : r.broad ? "Senior leaders (C-suite, VP, head, director)" : "No event titles found, so these are senior leaders"}${r.mode === "email" || r.mode === "name" ? "" : r.near ? " based in the New York area (NY, NJ, CT)." : r.widened ? ", from anywhere: Apollo has nobody matching in the New York area." : ", from anywhere."}
        ${r.total > r.people.length ? `Showing ${r.people.length} of ${r.total}.` : ""} ${r.mode === "email" ? "" : "Add uses about 1 Apollo credit per person and fills in their work email."}</p>
      <p class="sub" style="margin:0 0 8px;display:flex;gap:14px;flex-wrap:wrap">
        ${r.mode === "name" || r.mode === "email" ? '<button class="linkish" id="apolloEvents">Back to event titles</button>' : r.widened ? "" : `<button class="linkish" id="apolloWhere">${r.near ? "Show everywhere" : "New York area only"}</button>`}
        ${r.mode === "name" || r.mode === "email" ? "" : r.mode === "events" ? '<button class="linkish" id="apolloBroad">Senior leaders instead</button>' : r.broad ? '<button class="linkish" id="apolloEvents">Event titles instead</button>' : ""}</p>
      ${r.others && r.others.length ? `<p class="sub" style="margin:0 0 8px">Wrong company? Apollo also has ${r.others.map((o) => esc(o.name) + " (" + esc(o.domain) + ")").join(", ")}. Put the right website on the prospect and search again.</p>` : ""}
      ${rows ? `<ul class="aplist">${rows}</ul>` : `<p style="margin:0">${r.mode === "name" ? "Apollo has nobody by that name at this company. Try their email instead." : "Apollo has no people listed for this company."}</p>`}
      ${r.people.length < r.total ? `<div class="row" style="justify-content:center;margin-top:8px"><button class="btn" id="apolloMore">Load ${Math.min(25, r.total - r.people.length)} more</button></div>` : ""}</div>`;
  }

  async function addPerson(id, btn) {
    btn.disabled = true; btn.textContent = "Adding…";
    try {
      const pre = st.results && st.results.revealed && st.results.revealed[id];
      const p = pre || await api("POST", "/api/apollo/reveal", { id });
      if (!S.open || st.results?.leadId !== S.open) return;
      const l = readDrawer();
      l.contacts = l.contacts || [];
      const dup = l.contacts.find((c) => (p.email && c.email && c.email.toLowerCase() === p.email.toLowerCase()) || (c.name && c.name.toLowerCase() === (p.name || "").toLowerCase()));
      const c = { name: p.name, title: p.title, role: roleFor(p.title), email: p.email, phone: p.phone, linkedin: p.linkedin, apolloId: id };
      if (dup) Object.assign(dup, Object.fromEntries(Object.entries(c).filter(([, v]) => v))); else l.contacts.push(c);
      if (!l.website && p.website) { l.website = p.website; const w = document.getElementById("d_website"); if (w) w.value = p.website; }
      if (!l.source) { l.source = "Apollo"; const s = document.getElementById("d_source"); if (s) s.value = "Apollo"; }
      S.leads.set(l.id, l); renderContacts(); refreshDrawerScore(); scheduleSave(); paintResults();
      toast(p.email ? `Added ${p.name}` : `Added ${p.name}. Apollo had no email to share.`);
    } catch (err) { btn.disabled = false; btn.textContent = "Add"; toast(err.message); }
  }

  // ---------- company details ("Fill from Apollo") ----------
  const today = () => new Date().toISOString().slice(0, 10);
  const num = (n) => Number(n).toLocaleString("en-US");
  const kwMarket = (d) => { const t = `${d.industry || ""} ${(d.keywords || []).join(" ")}`; const m = MARKETS.find((m) => m.id !== "tradeshow" && m.kw.test(t)); return m ? m.id : ""; };
  const orgBusy = new Set();

  // Copies Apollo's answer onto a prospect. Never overwrites what a rep typed: industry and website
  // are filled only when empty, and the market is a suggestion that a chosen market always beats.
  function applyOrg(l, d) {
    l.org = { name: d.name, domain: d.domain, industry: d.industry, keywords: d.keywords, employees: d.employees, revenue: d.revenue, revenueText: d.revenueText,
      description: d.description, hq: d.hq, founded: d.founded, linkedin: d.linkedin, phone: d.phone, logo: d.logo, market: d.market || kwMarket(d), at: today() };
    delete l.orgMiss;
    if (!l.industry && d.industry) l.industry = d.industry;
    if (!l.website && d.website) l.website = d.website;
    if (!l.source) l.source = "Apollo";
    return l;
  }

  async function lookup(l, bulkRun) {
    return api("POST", "/api/apollo/company", { company: l.company, website: l.website, leadId: l.id, bulk: !!bulkRun });
  }

  async function fillOpen(auto) {
    const id = S.open; if (!id || orgBusy.has(id)) return;
    const l0 = readDrawer(); S.leads.set(l0.id, l0);
    orgBusy.add(id); paintOrg();
    try {
      const d = await lookup(l0);
      if (S.open !== id) { const l = S.leads.get(id); if (l) putLead(applyOrg({ ...l }, d)); return; }
      const l = applyOrg(readDrawer(), d);
      const set = (f) => { const el = document.getElementById("d_" + f); if (el && !el.value && l[f]) el.value = l[f]; };
      set("industry"); set("website"); set("source");
      S.leads.set(l.id, l); refreshDrawerScore(); scheduleSave();
      const auto0 = document.querySelector('#d_market option[value=""]'); if (auto0) auto0.textContent = "Auto: " + (MK[guessMarket(l)]?.short || "none");
      if (!auto) toast(l.org.market && !l.market ? `Filled from Apollo. Market: ${MK[l.org.market].short}` : "Filled from Apollo");
    } catch (err) {
      st.orgErr = { id, msg: err.message };
    } finally { orgBusy.delete(id); paintOrg(); }
  }

  function paintOrg() {
    const box = document.getElementById("apolloOrg"); if (!box || !S.open) return;
    const l = S.leads.get(S.open); if (!l) return;
    const o = l.org;
    if (orgBusy.has(l.id)) { box.innerHTML = `<div class="apbox"><p class="sub" style="margin:0">Looking up ${esc(l.company)} in Apollo…</p></div>`; return; }
    const err = st.orgErr && st.orgErr.id === l.id ? `<p class="sub" style="margin:6px 0 0">${esc(st.orgErr.msg)}</p>` : "";
    if (!o) {
      box.innerHTML = `<div class="row" style="gap:10px;margin-top:10px;flex-wrap:wrap"><button class="btn" id="apolloOrgFill">Fill from Apollo</button>
        <span class="sub">Adds industry, size, HQ and a suggested market. About 1 Apollo credit${l.website ? "" : " (2 without a website)"}.</span></div>${err}`;
      return;
    }
    const mk = o.market && MK[o.market];
    const facts = [o.industry, o.employees ? "~" + num(o.employees) + " employees" : "", o.revenueText ? o.revenueText + " revenue" : "", o.hq ? "HQ " + o.hq : "", o.founded ? "Founded " + o.founded : ""].filter(Boolean);
    box.innerHTML = `<div class="apbox"><div class="orgcard">${o.logo ? `<img src="${esc(o.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<div style="flex:1;min-width:0">
      <div class="row" style="justify-content:space-between;align-items:baseline;gap:8px"><b>${esc(o.name)} <span class="sub">${esc(o.domain || "")}</span></b>
        <span class="sub">From Apollo, ${esc(o.at || "")} · <button class="linkish" id="apolloOrgFill">Refresh</button></span></div>
      <div class="orgfacts sub">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}${o.linkedin ? `<a href="${esc(o.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ""}</div>
      ${o.description ? `<p style="margin:4px 0 0;font-size:14px">${esc(o.description)}</p>` : ""}
      ${mk ? `<p class="sub" style="margin:6px 0 0">${l.market ? (l.market === o.market ? "Market matches Apollo's industry." : `Apollo's industry suggests <b>${esc(mk.short)}</b>; you picked another market, which wins.`) : `Market set automatically to <b>${esc(mk.short)}</b> from Apollo's industry. Pick another above if it's wrong.`}</p>`
        : `<p class="sub" style="margin:6px 0 0">Apollo's industry doesn't match one of your markets. Pick one above.</p>`}
    </div></div>${err}</div>`;
  }

  // Website typed or changed on a prospect Apollo hasn't looked up yet: look it up automatically.
  document.addEventListener("change", (e) => {
    const id = e.target && e.target.id;
    if (id === "d_market") setTimeout(paintOrg, 60);
    if (id === "d_website" && st.connected && S.open) {
      const l = S.leads.get(S.open);
      if (l && !l.org && /\.[a-z]{2,}/i.test(e.target.value)) setTimeout(() => fillOpen(true), 80);
    }
  });

  // ---------- fill many prospects at once (Owners and Managers, from Settings) ----------
  const bulkState = { running: false, stop: false, done: 0, total: 0, filled: 0, missed: 0, msg: "" };
  const needsOrg = () => [...S.leads.values()].filter((l) => !l.example && !l.org && !l.orgMiss && !marketOf(l) && !["Won", "Lost", "Not a fit"].includes(l.status)
    && (l.website || (l.company && !/^new prospect$/i.test(l.company))));
  function bulkHtml() {
    const n = needsOrg().length;
    const b = bulkState;
    return `<div class="apbox" id="apolloBulkBox"><b>Fill company details for your prospects</b>
      <p class="sub" style="margin:4px 0 8px">Looks up each open prospect that has no market yet, fills in industry, size and HQ, and picks the market from the industry. About 1 Apollo credit each, 2 when there's no website.</p>
      ${b.running ? `<p style="margin:0 0 8px">Working: ${b.done} of ${b.total}… <button class="btn ghost" id="apolloBulkStop">Stop</button></p>`
        : `${b.msg ? `<p style="margin:0 0 8px">${esc(b.msg)}</p>` : ""}${n ? `<button class="btn primary" id="apolloBulk">Fill ${n} prospect${n === 1 ? "" : "s"} from Apollo</button>` : '<p class="sub" style="margin:0">Every open prospect has a market or has been looked up.</p>'}`}</div>`;
  }
  function paintBulk() { const b = document.getElementById("apolloBulkBox"); if (b) b.outerHTML = bulkHtml(); }
  async function bulk(btn) {
    if (bulkState.running) return;
    if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = `Click again to use up to ${needsOrg().length * 2} credits`; return; }
    const list = needsOrg().slice(0, 300);
    Object.assign(bulkState, { running: true, stop: false, done: 0, total: list.length, filled: 0, missed: 0, msg: "" });
    paintBulk();
    for (const l0 of list) {
      if (bulkState.stop) break;
      try {
        const d = await lookup(l0, true);
        const l = S.leads.get(l0.id); if (l && !l.org) { putLead(applyOrg({ ...l }, d)); bulkState.filled++; }
      } catch (err) {
        if (/limit|credits|key|connected/i.test(err.message)) { bulkState.msg = err.message; break; }
        const l = S.leads.get(l0.id); if (l) putLead({ ...l, orgMiss: today() });
        bulkState.missed++;
      }
      bulkState.done++; paintBulk();
      await new Promise((r) => setTimeout(r, 250));
    }
    bulkState.running = false;
    bulkState.msg = (bulkState.msg ? bulkState.msg + " " : "") + `Filled ${bulkState.filled}${bulkState.missed ? `, ${bulkState.missed} not found in Apollo (add their websites and use Fill from Apollo)` : ""}.`;
    paintBulk(); toast(`Filled ${bulkState.filled} prospect${bulkState.filled === 1 ? "" : "s"} from Apollo`);
  }

  // Re-paint results if the drawer re-renders, and keep the card fresh when Settings opens.
  new MutationObserver(() => {
    if (st.results && document.getElementById("apolloBox") && !document.querySelector("#apolloBox .apbox")) paintResults();
    const ob = document.getElementById("apolloOrg"); if (ob && !ob.dataset.painted) { ob.dataset.painted = "1"; st.orgErr = null; paintOrg(); }
  })
    .observe(document.getElementById("drawerRoot"), { childList: true });
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#settings")) refresh(); });
  refresh();
})();
