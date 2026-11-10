/* VenueScout: Venues and offers (Settings).
   The venues Scout sells and the seasonal offers it may pitch. Owners and Managers edit; everyone can read.
   Loaded after the main script, which exposes its helpers as window.VSAPP. */
(function () {
  const A = window.VSAPP; if (!A) return;
  const { esc, toast, MARKETS } = A;
  const $ = (id) => document.getElementById(id);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const st = { cat: null, canEdit: false, styles: [], dirty: false, open: new Set() };
  document.head.insertAdjacentHTML("beforeend", `<style>
    .vnlist details{border:1px solid var(--line);border-radius:8px;padding:10px 14px;margin:8px 0;background:var(--bg)}
    .vnlist summary{cursor:pointer;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
    .vnlist summary b{font-size:16px}
    .vngrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px 16px;margin:10px 0}
    .vnwide{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px 16px}
    .vnwide textarea{min-height:90px}
    .vnmk{display:flex;flex-wrap:wrap;gap:4px 14px;margin:6px 0}
    .vnmk label,.ofv label{display:flex;gap:6px;align-items:center;font-size:13px}
    .vnmk input,.ofv input,.ofon input{width:auto;margin:0}
    .oftable{width:100%;border-collapse:collapse}
    .oftable td,.oftable th{border-top:1px solid var(--line);padding:8px 6px;vertical-align:top;text-align:left;font-size:14px}
    .ofv{display:flex;flex-direction:column;gap:2px}
    .ofdate{display:flex;gap:4px}.ofdate select{width:auto}.ofdate input{width:58px}
    .vnbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
    @media (max-width:760px){.oftable thead{display:none}.oftable tr{display:block;border-top:1px solid var(--line);padding:8px 0}.oftable td{display:block;border:0;padding:4px 0}}
  </style>`);

  const api = async (method, body) => {
    const r = await fetch("/api/venues", { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  };
  async function load() {
    try { const j = await api("GET"); st.cat = j.catalog; st.canEdit = !!j.canEdit; st.styles = j.styles || []; st.dirty = false; paint(); }
    catch (e) { const b = $("venueCtl"); if (b) b.innerHTML = `<p class="sub">${esc(e.message)}</p>`; }
  }
  const prettyMd = (s) => (/^\d\d-\d\d$/.test(s || "") ? `${MONTHS[+s.slice(0, 2) - 1]} ${+s.slice(3)}` : "");
  const vname = (id) => (st.cat.venues.find((v) => v.id === id) || {}).name || id;

  function venueHtml(v, i) {
    const ro = st.canEdit ? "" : "disabled";
    const cap = [v.seated ? v.seated + " seated" : "", v.standing ? v.standing + " standing" : ""].filter(Boolean).join(" · ");
    return `<details data-vi="${i}" ${st.open.has(v.id) ? "open" : ""}><summary><b>${esc(v.name || "New venue")}</b><span class="chip">${esc(v.style)}</span><span class="sub">${esc(v.location)}${cap ? " · " + esc(cap) : ""}</span></summary>
      <div class="vngrid">
        <label class="f">Name<input data-vf="name" value="${esc(v.name)}" ${ro}></label>
        <label class="f">Company<input data-vf="company" value="${esc(v.company)}" ${ro}></label>
        <label class="f">Where<input data-vf="location" value="${esc(v.location)}" ${ro}></label>
        <label class="f">Style<select data-vf="style" ${ro}>${st.styles.map((s) => `<option ${s === v.style ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
        <label class="f">Seated capacity<input data-vf="seated" type="number" min="0" value="${v.seated || ""}" ${ro}></label>
        <label class="f">Standing capacity<input data-vf="standing" type="number" min="0" value="${v.standing || ""}" ${ro}></label>
        <label class="f">Events contact<input data-vf="contact" value="${esc(v.contact)}" ${ro}></label>
      </div>
      <div class="vnwide">
        <label class="f">What it's like (Scout uses this to pitch)<textarea data-vf="about" ${ro}>${esc(v.about)}</textarea></label>
        <label class="f">Spaces, one per line<textarea data-vf="spaces" ${ro}>${esc(v.spaces)}</textarea></label>
        <label class="f">Packages and prices, one per line<textarea data-vf="packages" ${ro}>${esc(v.packages)}</textarea></label>
      </div>
      <p class="sub" style="margin:10px 0 0">Best for these markets</p>
      <div class="vnmk">${MARKETS.map((m) => `<label><input type="checkbox" data-vmk="${esc(m.id)}" ${v.bestFor.includes(m.id) ? "checked" : ""} ${ro}>${esc(m.short)}</label>`).join("")}</div>
      ${st.canEdit ? `<button class="btn" data-vdel="${i}" style="margin-top:6px">Remove venue</button>` : ""}
    </details>`;
  }
  const dateSel = (k, val, i, ro) => {
    const m = /^\d\d-\d\d$/.test(val || "") ? +val.slice(0, 2) : 0, d = m ? +val.slice(3) : "";
    return `<span class="ofdate"><select data-of="${k}m" data-oi="${i}" aria-label="Month" ${ro}><option value="">Month</option>${MONTHS.map((x, j) => `<option value="${j + 1}" ${j + 1 === m ? "selected" : ""}>${x}</option>`).join("")}</select><input data-of="${k}d" data-oi="${i}" type="number" min="1" max="31" placeholder="Day" value="${d}" aria-label="Day" ${ro}></span>`;
  };
  function offerRow(o, i) {
    const ro = st.canEdit ? "" : "disabled";
    return `<tr>
      <td><label class="ofon"><input type="checkbox" data-of="on" data-oi="${i}" ${o.on ? "checked" : ""} ${ro}> On</label></td>
      <td><input data-of="title" data-oi="${i}" value="${esc(o.title)}" placeholder="e.g. Holiday parties" ${ro}><textarea data-of="details" data-oi="${i}" placeholder="What's included, minimums, perks" style="margin-top:6px;min-height:60px" ${ro}>${esc(o.details)}</textarea></td>
      <td><div class="ofv">${st.cat.venues.map((v) => `<label><input type="checkbox" data-ofv="${esc(v.id)}" data-oi="${i}" ${o.venueIds.includes(v.id) ? "checked" : ""} ${ro}>${esc(v.name)}</label>`).join("")}</div></td>
      <td>From ${dateSel("from", o.from, i, ro)}<div style="height:6px"></div>To ${dateSel("to", o.to, i, ro)}<p class="sub" style="margin:4px 0 0">Repeats every year</p></td>
      <td><input data-of="priceFrom" data-oi="${i}" value="${esc(o.priceFrom)}" placeholder="$95pp" ${ro}></td>
      <td>${st.canEdit ? `<button class="btn" data-odel="${i}" aria-label="Remove offer">Remove</button>` : ""}</td></tr>`;
  }
  function paint() {
    const box = $("venueCtl"); if (!box || !st.cat) return;
    const c = st.cat, live = c.offers.filter((o) => o.on);
    const chip = $("venueChip"); if (chip) { chip.textContent = `${c.venues.length} venues · ${live.length} offer${live.length === 1 ? "" : "s"} on`; chip.className = "chip" + (live.length ? " ok" : ""); }
    box.innerHTML = `<p class="sub" style="margin:0 0 6px">Scout picks a venue, a space and, when one fits the date, a seasonal offer for every prospect it finds, using what's written here. Keep it current: what you write is what Scout pitches.</p>
      <div class="vnlist">${c.venues.map(venueHtml).join("")}</div>
      ${st.canEdit ? '<button class="btn" id="vnAdd">Add venue</button>' : ""}
      <h4 style="margin:22px 0 4px">Seasonal offers</h4>
      <p class="sub" style="margin:0 0 6px">Only offers that are <b>On</b> are pitched, and only when the event would fall within their dates. ${live.length ? "On now: " + live.map((o) => `${esc(o.title)} (${prettyMd(o.from)}–${prettyMd(o.to)})`).join(", ") + "." : "None are on yet."}</p>
      <table class="oftable"><thead><tr><th></th><th>Offer</th><th>Venues</th><th>Season</th><th>From</th><th></th></tr></thead><tbody>${c.offers.map(offerRow).join("")}</tbody></table>
      ${st.canEdit ? `<div class="vnbar"><button class="btn" id="ofAdd">Add offer</button><button class="btn primary" id="vnSave">Save venues and offers</button><span class="sub" id="vnState">${st.dirty ? "Unsaved changes" : ""}</span></div>` : '<p class="sub">Only Owners and Managers can change these.</p>'}`;
  }
  const mark = () => { st.dirty = true; const s = $("vnState"); if (s) s.textContent = "Unsaved changes"; };
  const setDate = (o, k, el) => {
    const row = el.closest("tr"), m = row.querySelector(`[data-of="${k}m"]`).value, d = row.querySelector(`[data-of="${k}d"]`).value;
    o[k] = m && d ? `${String(m).padStart(2, "0")}-${String(Math.min(31, Math.max(1, +d))).padStart(2, "0")}` : "";
  };

  document.addEventListener("input", (e) => {
    const t = e.target; if (!st.cat || !t.closest || !t.closest("#venueCtl")) return;
    const d = t.closest("[data-vi]");
    if (d && t.dataset.vf) { const v = st.cat.venues[+d.dataset.vi]; v[t.dataset.vf] = t.type === "number" ? Number(t.value) || 0 : t.value; mark(); return; }
    if (d && t.dataset.vmk) { const v = st.cat.venues[+d.dataset.vi]; v.bestFor = v.bestFor.filter((m) => m !== t.dataset.vmk); if (t.checked) v.bestFor.push(t.dataset.vmk); mark(); return; }
    if (t.dataset.oi != null) {
      const o = st.cat.offers[+t.dataset.oi]; if (!o) return;
      if (t.dataset.ofv) { o.venueIds = o.venueIds.filter((x) => x !== t.dataset.ofv); if (t.checked) o.venueIds.push(t.dataset.ofv); }
      else if (t.dataset.of === "on") o.on = t.checked;
      else if (/^(from|to)[md]$/.test(t.dataset.of)) setDate(o, t.dataset.of.slice(0, -1), t);
      else o[t.dataset.of] = t.value;
      mark();
    }
  });
  document.addEventListener("change", (e) => { if (e.target.closest && e.target.closest("#venueCtl") && (e.target.tagName === "SELECT" || e.target.type === "checkbox")) e.target.dispatchEvent(new Event("input", { bubbles: true })); });
  document.addEventListener("toggle", (e) => { const d = e.target; if (d.dataset && d.dataset.vi != null && st.cat) { const id = st.cat.venues[+d.dataset.vi].id; d.open ? st.open.add(id) : st.open.delete(id); } }, true);
  document.addEventListener("click", async (e) => {
    const t = e.target; if (!st.cat || !t.closest || !t.closest("#venueCtl")) return;
    if (t.id === "vnAdd") { const id = "v" + Date.now().toString(36); st.cat.venues.push({ id, name: "", company: "", location: "", style: "Upscale", seated: 0, standing: 0, about: "", spaces: "", packages: "", bestFor: [], contact: "" }); st.open.add(id); mark(); paint(); return; }
    if (t.id === "ofAdd") { st.cat.offers.push({ id: "o" + Date.now().toString(36), title: "", venueIds: [], from: "", to: "", details: "", priceFrom: "", on: false }); mark(); paint(); return; }
    if (t.dataset.vdel != null) { const v = st.cat.venues[+t.dataset.vdel]; if (!confirm(`Remove ${v.name || "this venue"}? Scout will stop pitching it once you save.`)) return; st.cat.venues.splice(+t.dataset.vdel, 1); st.cat.offers.forEach((o) => (o.venueIds = o.venueIds.filter((x) => x !== v.id))); mark(); paint(); return; }
    if (t.dataset.odel != null) { st.cat.offers.splice(+t.dataset.odel, 1); mark(); paint(); return; }
    if (t.id === "vnSave") {
      t.disabled = true;
      try { const j = await api("PUT", st.cat); st.cat = j.catalog; st.dirty = false; toast("Saved. Scout uses these from its next run."); paint(); }
      catch (err) { toast(err.message); t.disabled = false; }
    }
  });
  window.addEventListener("beforeunload", (e) => { if (st.dirty) { e.preventDefault(); e.returnValue = ""; } });
  (window.VS && window.VS.ready ? window.VS.ready : Promise.resolve()).then(load, load);
})();
