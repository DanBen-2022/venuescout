/* VenueScout: Apollo.io connector UI (Settings card + "Find with Apollo" in the prospect drawer).
   Loaded after the main script, which exposes the helpers it needs as window.VSAPP. */
(function () {
  const A = window.VSAPP; if (!A) return;
  const { S, esc, toast, readDrawer, draftLead, renderContacts, refreshDrawerScore, scheduleSave, roleFor } = A;
  const st = { connected: false, canEdit: false, last4: null, source: null, results: null, busy: false };
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = "/login"; throw new Error("Please sign in."); }
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
        Open any prospect and use <b>Find with Apollo</b> next to Add person.</p>
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
    if (t.id === "apolloFind" || t.id === "apolloBroad") find(t.id === "apolloBroad");
    if (t.id === "apolloClose") { st.results = null; paintResults(); }
    const add = t.closest && t.closest("[data-apadd]"); if (add) addPerson(add.dataset.apadd, add);
  });

  async function find(broad) {
    if (st.busy || !S.open) return;
    const l = readDrawer(); const box = document.getElementById("apolloBox"); if (!box) return;
    st.busy = true; st.results = null;
    box.innerHTML = `<div class="sec apbox"><p class="sub" style="margin:0">Searching Apollo for people at ${esc(l.company)}…</p></div>`;
    try { st.results = await api("POST", "/api/apollo/search", { company: l.company, website: l.website, broad }); st.results.leadId = l.id; st.results.broad = broad; }
    catch (err) { box.innerHTML = `<div class="sec apbox"><div class="row" style="justify-content:space-between"><p style="margin:0">${esc(err.message)}</p><button class="btn ghost" id="apolloClose">Close</button></div></div>`; }
    finally { st.busy = false; }
    if (st.results) paintResults();
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
      <p class="sub" style="margin:4px 0 8px">${r.mode === "events" ? "People with event, trade show and marketing titles." : r.broad ? "Senior leaders (C-suite, VP, head, director)." : "No event titles found, so these are senior leaders."}
        ${r.total > r.people.length ? `Showing ${r.people.length} of ${r.total}.` : ""} Add uses about 1 Apollo credit per person and fills in their work email.
        ${r.mode === "events" ? '<button class="linkish" id="apolloBroad">Show senior leaders instead</button>' : ""}</p>
      ${r.others && r.others.length ? `<p class="sub" style="margin:0 0 8px">Wrong company? Apollo also has ${r.others.map((o) => esc(o.name) + " (" + esc(o.domain) + ")").join(", ")}. Put the right website on the prospect and search again.</p>` : ""}
      ${rows ? `<ul class="aplist">${rows}</ul>` : '<p style="margin:0">Apollo has no people listed for this company.</p>'}</div>`;
  }

  async function addPerson(id, btn) {
    btn.disabled = true; btn.textContent = "Adding…";
    try {
      const p = await api("POST", "/api/apollo/reveal", { id });
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

  // Re-paint results if the drawer re-renders, and keep the card fresh when Settings opens.
  new MutationObserver(() => { if (st.results && document.getElementById("apolloBox") && !document.querySelector("#apolloBox .apbox")) paintResults(); })
    .observe(document.getElementById("drawerRoot"), { childList: true });
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#settings")) refresh(); });
  refresh();
})();
