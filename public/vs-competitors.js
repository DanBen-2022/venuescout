/* VenueScout: Competitor venues (Settings).
   Other New York venues and the clients they name. Scout rates those clients as prospects for
   smaller events around their big ones, and watches the news for new events at each venue.
   Loaded after the main script, which exposes its helpers as window.VSAPP. */
(function () {
  const A = window.VSAPP; if (!A) return;
  const { S, esc, toast, MARKETS } = A;
  const $ = (id) => document.getElementById(id);
  const st = { list: null, canEdit: false, dirty: false, open: new Set() };
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const api = async (method, body) => {
    const r = await fetch("/api/competitors", { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  };
  async function load() {
    try { const j = await api("GET"); st.list = j.competitors || []; st.canEdit = !!j.canEdit; st.dirty = false; paint(); }
    catch (e) { const b = $("compCtl"); if (b) b.innerHTML = `<p class="sub">${esc(e.message)}</p>`; }
  }

  // Which named clients are already prospects, and what Scout made of them.
  function inApp(name) {
    const k = norm(name); if (!k) return null;
    for (const l of S.leads.values()) if (norm(l.company) === k) return l;
    return null;
  }

  function venueHtml(v, i) {
    const ro = st.canEdit ? "" : "disabled";
    const have = v.clients.filter((k) => inApp(k.name)).length;
    return `<details data-ci="${i}" ${st.open.has(v.id) ? "open" : ""}><summary><b>${esc(v.name || "New venue")}</b>
        <span class="chip ${v.on ? "ok" : ""}">${v.on ? "Scout watches" : "Off"}</span>
        <span class="sub">${esc(v.address)} · ${v.clients.length} named clients${have ? ` · ${have} already in Prospects` : ""}</span>
        ${/^https?:\/\//.test(v.website) ? `<a class="sub" href="${esc(v.website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : ""}</summary>
      <div class="vngrid">
        <label class="f">Name<input data-cf="name" value="${esc(v.name)}" ${ro}></label>
        <label class="f">Website<input data-cf="website" value="${esc(v.website)}" placeholder="https://…" ${ro}></label>
        <label class="f">Address<input data-cf="address" value="${esc(v.address)}" ${ro}></label>
        <label class="f">Capacity<input data-cf="capacity" value="${esc(v.capacity)}" ${ro}></label>
      </div>
      <label class="f">Notes<input data-cf="notes" value="${esc(v.notes)}" ${ro}></label>
      <label class="row" style="gap:8px;margin:8px 0"><input type="checkbox" data-cf="on" style="width:auto;margin:0" ${v.on ? "checked" : ""} ${ro}> Scout checks this venue's clients and news each night</label>
      <h4 class="vnsub">Named clients</h4>
      <p class="sub" style="margin:0 0 4px">Organizations this venue says it hosted. Scout checks a few each night against Tripleseat and the news, then files the good ones under their market. Leave out private people.</p>
      <table class="vnrows"><tbody>${v.clients.map((k, j) => { const l = inApp(k.name); return `<tr>
        <td style="width:26%"><input data-kf="name" data-kj="${j}" value="${esc(k.name)}" placeholder="Organization" ${ro}>${l ? `<span class="chip" style="margin-top:4px">In Prospects${l.foundBy === "scout" && l.scout ? ": " + esc(l.scout.status) : ""}</span>` : ""}</td>
        <td><input data-kf="event" data-kj="${j}" value="${esc(k.event)}" placeholder="Event, e.g. Annual gala" ${ro}></td>
        <td style="width:10%"><input data-kf="guests" data-kj="${j}" type="number" min="0" value="${k.guests || ""}" placeholder="Guests" ${ro}></td>
        <td style="width:16%"><select data-kf="market" data-kj="${j}" ${ro}><option value="">Market…</option>${MARKETS.map((m) => `<option value="${esc(m.id)}" ${m.id === k.market ? "selected" : ""}>${esc(m.short)}</option>`).join("")}</select></td>
        <td style="width:18%"><input data-kf="source" data-kj="${j}" value="${esc(k.source)}" placeholder="Where it says so (link)" ${ro}>${/^https?:\/\//.test(k.source) ? ` <a class="sub" href="${esc(k.source)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}</td>
        <td>${st.canEdit ? `<button class="btn" data-kdel="${j}" aria-label="Remove client">✕</button>` : ""}</td></tr>`; }).join("")}</tbody></table>
      ${st.canEdit ? `<div class="row" style="gap:8px;margin-top:6px"><button class="btn" data-kadd="${i}">Add client</button><button class="btn" data-cdel="${i}">Remove venue</button></div>` : ""}
    </details>`;
  }

  function paint() {
    const box = $("compCtl"), chip = $("compChip"); if (!box || !st.list) return;
    const on = st.list.filter((v) => v.on).length;
    if (chip) { chip.textContent = on ? `${on} watched` : "None watched"; chip.className = "chip " + (on ? "ok" : "q"); }
    box.innerHTML = `<div class="vnlist">${st.list.map(venueHtml).join("") || '<p class="sub">No competitor venues yet.</p>'}</div>
      ${st.canEdit ? `<div class="vnbar"><button class="btn" id="compAdd">Add venue</button><button class="btn primary" id="compSave">Save competitor venues</button><span class="sub" id="compState">${st.dirty ? "Unsaved changes" : ""}</span></div>
        <p class="sub" style="margin:8px 0 0">Turn the nightly check on or off in Scout settings below. Pitches from this list are for smaller events that fit your rooms: host committee dinners, VIP receptions, after-parties, and team or client events.</p>` : '<p class="sub">Only Owners and Managers can change these.</p>'}`;
  }

  const mark = () => { st.dirty = true; const s = $("compState"); if (s) s.textContent = "Unsaved changes"; };
  document.addEventListener("toggle", (e) => {
    const d = e.target; if (!st.list || !d.matches || !d.matches("#compCtl details")) return;
    const v = st.list[+d.dataset.ci]; if (v) d.open ? st.open.add(v.id) : st.open.delete(v.id);
  }, true);
  document.addEventListener("input", (e) => {
    const t = e.target; if (!st.list || !t.closest || !t.closest("#compCtl")) return;
    const d = t.closest("[data-ci]"); if (!d) return;
    const v = st.list[+d.dataset.ci];
    if (t.dataset.cf) { v[t.dataset.cf] = t.type === "checkbox" ? t.checked : t.value; mark(); return; }
    if (t.dataset.kf) { const k = v.clients[+t.dataset.kj]; k[t.dataset.kf] = t.type === "number" ? Number(t.value) || 0 : t.value; mark(); }
  });
  document.addEventListener("change", (e) => { if (e.target.closest && e.target.closest("#compCtl") && (e.target.tagName === "SELECT" || e.target.type === "checkbox")) e.target.dispatchEvent(new Event("input", { bubbles: true })); });
  document.addEventListener("click", async (e) => {
    const t = e.target; if (!st.list || !t.closest || !t.closest("#compCtl")) return;
    if (t.id === "compAdd") { const id = "c" + Date.now().toString(36); st.list.push({ id, name: "", website: "", address: "", capacity: "", notes: "", on: true, clients: [] }); st.open.add(id); mark(); paint(); return; }
    const d = t.closest("[data-ci]"), v = d && st.list[+d.dataset.ci];
    if (v && t.dataset.kadd != null) { v.clients.push({ id: "k" + Date.now().toString(36), name: "", event: "", guests: 0, market: "", source: "" }); mark(); paint(); return; }
    if (v && t.dataset.kdel != null) { v.clients.splice(+t.dataset.kdel, 1); mark(); paint(); return; }
    if (v && t.dataset.cdel != null) { if (!confirm(`Remove ${v.name || "this venue"}? Prospects Scout already filed stay.`)) return; st.list.splice(+d.dataset.ci, 1); mark(); paint(); return; }
    if (t.id === "compSave") {
      t.disabled = true;
      try { const j = await api("PUT", { competitors: st.list }); st.list = j.competitors; st.dirty = false; toast("Saved. Scout uses these from its next run."); paint(); }
      catch (err) { toast(err.message); t.disabled = false; }
    }
  });
  window.addEventListener("beforeunload", (e) => { if (st.dirty) { e.preventDefault(); e.returnValue = ""; } });
  const jump = () => { if (location.hash === "#settings/competitors") setTimeout(() => { const c = $("competitors"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50); };
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#settings")) { if (!st.dirty) load(); jump(); } });
  load(); jump();
})();
