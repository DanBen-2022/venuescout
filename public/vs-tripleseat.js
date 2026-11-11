/* VenueScout: Tripleseat connector UI (Settings card + "Past work with the venue" in the prospect drawer).
   Loaded after the main script, which exposes the helpers it needs as window.VSAPP. */
(function () {
  const A = window.VSAPP; if (!A) return;
  const { S, esc, toast, readDrawer, renderContacts, refreshDrawerScore, scheduleSave, roleFor, MK, MARKETS } = A;
  const st = { connected: false, configured: false, canEdit: false, redirectUri: "", cache: new Map(), loading: null, editing: false };
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { if (window.VS && window.VS.toLogin) window.VS.toLogin(); else location.href = "/login"; throw new Error("Please sign in."); }
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  };
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const day = (s) => { if (!s) return ""; const d = new Date(s + "T12:00:00"); return isNaN(d) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

  async function refresh() {
    try { Object.assign(st, await api("GET", "/api/tripleseat")); } catch { /* keep */ }
    paintCard(); paintDrawer();
  }

  function paintCard() {
    const box = document.getElementById("tsCtl"), chip = document.getElementById("tsChip");
    if (!box) return;
    if (chip) { chip.textContent = st.connected ? "Connected" : st.configured ? "Finish connecting" : "Not connected"; chip.className = "chip " + (st.connected ? "ok" : "q"); }
    if (!st.canEdit) { box.innerHTML = `<p class="sub" style="margin:0">${st.connected ? "Connected. Open any prospect to see its history with the venue." : "Not connected. Ask an Owner or Manager to connect Tripleseat here."}</p>`; return; }
    if (st.connected && !st.editing) {
      const y = st.sync || {};
      const at = y.at ? new Date(y.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
      box.innerHTML = `<p class="sub" style="margin:0 0 8px">Connected. Every prospect now shows its past bookings with the venue, with one click to mark it a past client.</p>
        <p class="sub" style="margin:0 0 8px"><b>Lead sync:</b> new Tripleseat inquiries come into Prospects at 9 AM and 3 PM New York time (channel Inbound, source "Tripleseat lead"). Each one is then researched: Apollo company profile and the contact's title and LinkedIn (about 2 credits; none for personal emails), and Claude picks the market and writes a short brief at the top of the notes. ${at ? `Last run ${esc(at)}${y.error ? `: <span style="color:var(--bad)">${esc(y.error)}</span>` : `: ${y.imported || 0} added${y.updated ? `, ${y.updated} added to existing prospects` : ""}.`}` : "It hasn't run yet."}</p>
        <div class="row" style="gap:8px"><button class="btn" id="tsSync">Sync now</button><button class="btn" id="tsReconnect">Reconnect</button><button class="btn" id="tsDisconnect">Disconnect</button></div>`;
      return;
    }
    if (st.configured && !st.editing) {
      box.innerHTML = `<p class="sub" style="margin:0 0 8px">Your Tripleseat app is saved. Sign in to Tripleseat to finish connecting.</p>
        <div class="row" style="gap:8px"><button class="btn primary" id="tsGo">Sign in to Tripleseat</button><button class="btn ghost" id="tsEdit">Change UID or Secret</button><button class="btn ghost" id="tsDisconnect">Remove</button></div>`;
      return;
    }
    box.innerHTML = `<ol class="sub" style="margin:0 0 10px;padding-left:18px;line-height:1.55">
        <li>In Tripleseat, go to <b>Settings › Tripleseat API &amp; Webhooks › OAuth 2.0 Client Applications</b> and click <b>+ New Application</b>.</li>
        <li>Name it VenueScout, tick the <b>read</b> scope, and set the Redirect URL to:<br><code id="tsRedirect" style="user-select:all;word-break:break-all">${esc(st.redirectUri)}</code> <button class="linkish" id="tsCopy">Copy</button></li>
        <li>Save, then paste the <b>UID</b> and <b>Secret</b> here and click Connect. Tripleseat will ask you to approve.</li></ol>
      <label class="f" for="tsId">UID<input id="tsId" autocomplete="off"></label>
      <label class="f" for="tsSecret" style="margin-top:6px">Secret<input id="tsSecret" type="password" autocomplete="off"></label>
      <div class="row" style="gap:8px;margin-top:8px"><button class="btn primary" id="tsConnect">Connect to Tripleseat</button>${st.editing ? '<button class="btn ghost" id="tsCancel">Cancel</button>' : ""}</div>
      <p class="sub" id="tsMsg" style="margin:6px 0 0"></p>`;
  }

  async function go(body, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Opening Tripleseat…"; }
    try { const r = await api("PUT", "/api/tripleseat", body); location.href = r.url; }
    catch (err) { const m = document.getElementById("tsMsg"); if (m) m.textContent = err.message; else toast(err.message); if (btn) { btn.disabled = false; btn.textContent = "Try again"; } }
  }

  document.addEventListener("click", async (e) => {
    const t = e.target && e.target.closest ? e.target.closest("button,[data-tsmark]") : null; if (!t) return;
    if (t.id === "tsConnect") go({ clientId: document.getElementById("tsId").value, clientSecret: document.getElementById("tsSecret").value }, t);
    if (t.id === "tsGo" || t.id === "tsReconnect") go({}, t);
    if (t.id === "tsEdit") { st.editing = true; paintCard(); }
    if (t.id === "tsSync") {
      t.disabled = true; t.textContent = "Syncing…";
      try { const r = await api("POST", "/api/tripleseat/sync"); toast(r.skipped || r.error || `Added ${r.imported} new prospect${r.imported === 1 ? "" : "s"} from Tripleseat${r.updated ? `, and ${r.updated} to existing ones` : ""}${r.enriched ? `. Researched ${r.enriched} with Apollo and Claude` : ""}.`); if (window.VS && window.VS.refresh) window.VS.refresh(); }
      catch (err) { toast(err.message); }
      await refresh();
    }
    if (t.id === "tsCancel") { st.editing = false; paintCard(); }
    if (t.id === "tsCopy") { navigator.clipboard.writeText(st.redirectUri).then(() => toast("Redirect URL copied")); }
    if (t.id === "tsDisconnect") {
      if (!t.dataset.armed) { t.dataset.armed = "1"; t.textContent = "Click again to confirm"; return; }
      try { await api("DELETE", "/api/tripleseat"); st.cache.clear(); st.editing = false; await refresh(); toast("Tripleseat disconnected"); } catch (err) { toast(err.message); }
    }
    if (t.id === "tsRetry") { const l = S.leads.get(S.open); if (l) { st.cache.delete(cacheKey(l)); paintDrawer(); } }
    if (t.id === "tsAll") { const b = document.getElementById("tsBox"); if (b) b.dataset.all = "1"; paintDrawer(); }
    if (t.dataset && t.dataset.tsmark !== undefined) mark();
    if (t.dataset && t.dataset.tssim) search(t.dataset.tssim);
    if (t.dataset && t.dataset.tsadd !== undefined) addContact(+t.dataset.tsadd);
    if (t.dataset && t.dataset.tsuse !== undefined) useDetails();
    if (t.id === "tsClear") search("");
  });
  document.addEventListener("submit", (e) => { if (e.target.id !== "tsSearch") return; e.preventDefault(); search(document.getElementById("tsQ").value); });
  // Re-check when the company name or website is edited in the drawer.
  document.addEventListener("change", (e) => { if (e.target && (e.target.id === "d_company" || e.target.id === "d_website") && S.open) setTimeout(paintDrawer, 50); });

  const cacheKey = (l) => l.id + "|" + (l.company || "") + "|" + (l.website || "") + "|" + (st.typed[l.id] || "");
  st.typed = {};
  function search(q) { if (!S.open) return; st.typed[S.open] = q.trim(); paintDrawer(); }

  const lc = (s) => String(s || "").trim().toLowerCase();
  const onFile = (l, p) => (l.contacts || []).some((c) => (p.email && lc(c.email) === lc(p.email)) || (!p.email && p.name && lc(c.name) === lc(p.name)));
  function addContact(i) {
    const l0 = S.leads.get(S.open); if (!l0) return;
    const r = st.cache.get(cacheKey(l0)); const p = r && r.contacts && r.contacts[i]; if (!p) return;
    const l = readDrawer();
    if (onFile(l, p)) { toast(`${p.name || p.email} is already a contact`); paintDrawer(); return; }
    l.contacts = [...(l.contacts || []), { name: p.name, title: p.title, role: roleFor(p.title || ""), email: p.email, phone: p.phone, linkedin: "", tripleseatId: p.id || undefined }];
    S.leads.set(l.id, l); renderContacts(); refreshDrawerScore(); scheduleSave();
    toast(`Added ${p.name || p.email} from Tripleseat`);
    paintDrawer();
  }

  // Tripleseat's market segment names vary by venue; match them to VenueScout's markets by keyword.
  const SEG = [[/wedding|social|mitzvah|birthday|private party|celebration/i, "social"], [/non-?profit|charity|gala|foundation|association/i, "nonprofit"],
    [/financ|bank/i, "finance"], [/pharma|medical|health/i, "pharma"], [/law|legal|consult/i, "professional"], [/fashion|luxury|beauty/i, "luxury"],
    [/tech|media/i, "tech"], [/entertain|film|music|sport|production/i, "entertainment"], [/planner|agency|dmc|third/i, "planners"], [/trade ?show|exhibit|convention/i, "tradeshow"]];
  const segMarket = (seg) => { for (const [re, id] of SEG) if (re.test(seg || "")) return id; const m = MARKETS.find((m) => m.kw.test(seg || "")); return m ? m.id : ""; };
  const dom = (u) => String(u || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

  function useDetails() {
    const l0 = S.leads.get(S.open); if (!l0) return;
    const r = st.cache.get(cacheKey(l0)); const d = r && r.details; if (!d) return;
    const l = readDrawer(); const done = [];
    const w = document.getElementById("d_website"), ind = document.getElementById("d_industry"), mk = document.getElementById("d_market");
    let siteChanged = false;
    if (d.website && dom(l.website) !== d.website) {
      // A different company than the one Apollo matched: drop Apollo's details so it looks up the right one.
      if (l.org && l.org.domain !== d.website) { if (ind && ind.value === l.org.industry) { ind.value = ""; l.industry = ""; } delete l.org; }
      l.website = "https://" + d.website; if (w) w.value = l.website; siteChanged = true; done.push("website " + d.website);
    }
    const m = segMarket(d.segment);
    if (m && l.market !== m) { l.market = m; if (mk) mk.value = m; done.push("market " + MK[m].short); }
    if (!done.length) { toast("Already matches Tripleseat"); return; }
    S.leads.set(l.id, l); refreshDrawerScore(); scheduleSave();
    if (siteChanged && w) w.dispatchEvent(new Event("change", { bubbles: true }));
    toast("Updated " + done.join(" and ") + " from Tripleseat");
    setTimeout(paintDrawer, 60);
  }

  function mark() {
    const sel = document.getElementById("d_javitsBefore"); if (!sel) return;
    sel.value = "1";
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    toast("Marked as a past client");
    setTimeout(paintDrawer, 50);
  }

  function paintDrawer() {
    const box = document.getElementById("tsBox"); if (!box) return;
    if (!st.connected || !S.open) { box.innerHTML = ""; return; }
    const l = S.leads.get(S.open); if (!l) return;
    const key = cacheKey(l), r = st.cache.get(key);
    const head = '<h3 style="margin:0 0 6px">Past work with the venue <span class="sub">from Tripleseat</span></h3>';
    if (!r) {
      box.innerHTML = `<div class="sec">${head}<p class="sub" style="margin:0">Checking Tripleseat for ${esc(l.company)}…</p></div>`;
      if (st.loading !== key) {
        st.loading = key;
        api("POST", "/api/tripleseat/history", { company: l.company, website: l.website, query: st.typed[l.id] || "" })
          .then((d) => st.cache.set(key, d)).catch((err) => st.cache.set(key, { error: err.message }))
          .finally(() => { if (st.loading === key) st.loading = null; paintDrawer(); });
      }
      return;
    }
    const typed = st.typed[l.id] || "";
    const form = `<form id="tsSearch" class="row" style="gap:8px;margin-top:10px;flex-wrap:nowrap"><input id="tsQ" value="${esc(typed)}" placeholder="Search Tripleseat by name, email or domain" aria-label="Search Tripleseat" style="flex:1;min-width:0"><button class="btn">Search</button>${typed ? '<button type="button" class="btn ghost" id="tsClear">Clear</button>' : ""}</form>`;
    if (r.error) { box.innerHTML = `<div class="sec">${head}<p style="margin:0">${esc(r.error)} <button class="linkish" id="tsRetry">Try again</button></p>${form}</div>`; return; }
    const s = r.summary, marked = $isPast();
    let lead;
    if (s.pastClient) lead = `<p style="margin:0 0 8px"><span class="chip ok">Past client</span> Held <b>${s.held}</b> event${s.held === 1 ? "" : "s"} here, most recently on <b>${esc(day(s.lastHeld))}</b>${s.revenue ? `, ${money(s.revenue)} in total` : ""}.${s.upcoming ? ` ${s.upcoming} more booked.` : ""}</p>`;
    else if (r.bookings.length) lead = `<p style="margin:0 0 8px">No events held yet.${s.upcoming ? ` <b>${s.upcoming}</b> booked and coming up.` : ""}${s.open ? ` ${s.open} open inquir${s.open === 1 ? "y" : "ies"}.` : ""}${s.lost ? ` ${s.lost} lost.` : ""}</p>`;
    else lead = `<p class="sub" style="margin:0">${r.accounts.length ? `Found ${esc(r.accounts.map((a) => a.name).join(", "))} in Tripleseat, but no bookings.` : `No match for <b>${esc(r.searched?.email || r.searched?.name || l.company)}</b>${r.searched?.domain && !r.searched?.email ? " or " + esc(r.searched.domain) : ""} in Tripleseat.`} Try a contact's email or the company's domain below.</p>`;
    const similar = r.similar && r.similar.length ? `<p class="sub" style="margin:8px 0 0">Similar names in Tripleseat: ${r.similar.map((a) => `<button class="linkish" data-tssim="${esc(a.name)}">${esc(a.name)}</button>`).join(", ")}</p>` : "";
    const cs = r.contacts || [];
    const people = cs.length ? `<p class="sub" style="margin:10px 0 2px">People who booked</p><ul class="aplist">${cs.map((p, i) => `<li class="aprow"><span><b>${esc(p.name || p.email)}</b><div class="sub">${[p.title, p.email, p.phone].filter(Boolean).map(esc).join(" · ")}</div></span>${onFile(l, p) ? '<span class="chip ok">In contacts</span>' : `<button class="btn" data-tsadd="${i}">Add to contacts</button>`}</li>`).join("")}</ul>` : "";
    const all = box.dataset.all === "1", list = all ? r.bookings : r.bookings.slice(0, 4);
    const rows = list.map((b) => `<li class="aprow"><span><b>${esc(b.name || "Booking")}</b><div class="sub">${esc(day(b.start))}${b.location ? " · " + esc(b.location) : ""}${b.total ? " · " + money(b.total) : ""}</div></span><span class="chip ${b.status === "DEFINITE" || b.status === "CLOSED" ? "ok" : b.status === "LOST" ? "" : "q"}">${esc(b.status ? b.status[0] + b.status.slice(1).toLowerCase() : "")}</span></li>`).join("");
    box.innerHTML = `<div class="sec">${head}${lead}
      ${rows ? `<ul class="aplist">${rows}</ul>` : ""}
      ${!all && r.bookings.length > 4 ? `<button class="linkish" id="tsAll">Show all ${r.bookings.length}</button>` : ""}
      ${people}${detailsHtml(r, l)}${similar}${form}
      ${s.pastClient ? (marked ? '<p class="sub" style="margin:8px 0 0">Marked as a past client, so it gets the past-client bonus in the rating.</p>' : '<div style="margin-top:8px"><button class="btn primary" data-tsmark>Mark as past client</button> <span class="sub">Adds the past-client bonus to the rating.</span></div>') : ""}</div>`;
  }
  function detailsHtml(r, l) {
    const d = r.details; if (!d || (!d.website && !d.segment)) return "";
    const m = segMarket(d.segment);
    const siteOk = !d.website || dom(l.website) === d.website, mkOk = !m || l.market === m;
    const facts = [d.website ? "website " + esc(d.website) : "", d.segment ? "market segment " + esc(d.segment) + (m ? " (" + esc(MK[m].short) + ")" : "") : ""].filter(Boolean).join(" · ");
    return `<p class="sub" style="margin:10px 0 0">Tripleseat has ${facts}.${siteOk && mkOk ? " This prospect already matches." : ` <button class="btn" data-tsuse style="margin-left:6px">Use Tripleseat details</button>`}</p>`;
  }
  function $isPast() { const sel = document.getElementById("d_javitsBefore"); return sel ? sel.value === "1" : false; }

  new MutationObserver(() => { const b = document.getElementById("tsBox"); if (b && !b.dataset.painted) { b.dataset.painted = "1"; paintDrawer(); } })
    .observe(document.getElementById("drawerRoot"), { childList: true });

  const qs = new URLSearchParams(location.search);
  if (qs.get("tripleseat")) {
    setTimeout(() => toast(qs.get("tripleseat") === "connected" ? "Tripleseat connected" : (qs.get("msg") || "Tripleseat didn't connect")), 600);
    history.replaceState(null, "", location.pathname + location.hash);
  }
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#settings")) refresh(); });
  refresh();
})();
