/* VenueScout: Claude research tools. Settings card + "Find exhibitors" on the Import screen.
   Loaded after the main script, which exposes the helpers it needs as window.VSAPP. */
(function () {
  const A = window.VSAPP; if (!A) return;
  const { S, esc, toast, leadsForShow } = A;
  const st = { connected: false, canEdit: false, last4: null, source: null, busy: false, rows: [], note: "", picked: new Set(), err: "" };
  const $ = (id) => document.getElementById(id);
  document.head.insertAdjacentHTML("beforeend", `<style>
    #findBox .err{color:var(--bad)}
    .spin{display:inline-block;width:12px;height:12px;border:2px solid var(--line);border-top-color:var(--gold);border-radius:50%;animation:vsspin .8s linear infinite;vertical-align:-1px}
    @keyframes vsspin{to{transform:rotate(360deg)}}
    @media (prefers-reduced-motion:reduce){.spin{animation-duration:2.4s}}
  </style>`);
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { if (window.VS && window.VS.toLogin) window.VS.toLogin(); else location.href = "/login"; throw new Error("Please sign in."); }
    if (!r.ok) throw new Error(j.error || (r.status === 504 ? "The search took too long. Try again, or paste the directory page instead." : "Something went wrong."));
    return j;
  };

  async function refresh() {
    try { Object.assign(st, await api("GET", "/api/claude")); } catch { /* leave as is */ }
    paintCard(); paintFind();
  }

  // ---------- Settings › Integrations card ----------
  function paintCard() {
    const box = $("claudeCtl"); const chip = $("claudeChip");
    if (!box) return;
    if (chip) { chip.textContent = st.connected ? "Connected" : "Not connected"; chip.className = "chip " + (st.connected ? "ok" : "q"); }
    if (st.connected) {
      box.innerHTML = `<p class="sub" style="margin:0 0 8px">${st.source === "env" ? "Connected with a key set on the server." : st.last4 ? "Connected with the key ending in <b>" + esc(st.last4) + "</b>." : "Connected."}
        Use it from <b>Lead sources › Import a list › Find exhibitors</b>, or the Find exhibitors button on any show. A web search costs roughly $0.50 to $1.50 on your Claude account; reading pasted text costs a few cents.</p>
        ${st.canEdit && st.source !== "env" ? '<button class="btn" id="claudeDisconnect">Disconnect</button>' : ""}`;
    } else if (st.canEdit) {
      box.innerHTML = `<p class="sub" style="margin:0 0 8px">At <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">platform.claude.com › API keys</a>, create a key (and add a few dollars of credit under Billing), then paste it here. The key stays on the server; teammates never see it.</p>
        <div class="row" style="gap:8px;flex-wrap:nowrap"><input id="claudeKey" type="password" autocomplete="off" placeholder="sk-ant-…" aria-label="Claude API key" style="flex:1;min-width:0">
        <button class="btn primary" id="claudeConnect">Connect</button></div><p class="sub" id="claudeMsg" style="margin:6px 0 0"></p>`;
    } else {
      box.innerHTML = '<p class="sub" style="margin:0">Not connected. Ask an Owner or Manager to connect Claude here.</p>';
    }
  }

  // ---------- Import screen: Find exhibitors ----------
  function mount() {
    if ($("findBox")) return;
    const imp = $("impShow"); if (!imp) return;
    const row = imp.closest(".row");
    row.insertAdjacentHTML("afterend", `<div class="sec" id="findBox" style="margin:0 0 16px"></div>`);
    imp.addEventListener("change", () => { st.rows = []; st.note = ""; st.err = ""; st.picked.clear(); paintFind(); });
  }
  const curShow = () => S.shows.get(($("impShow") || {}).value || "");
  const fmtDates = (s) => [s.startDate, s.endDate && s.endDate !== s.startDate ? s.endDate : ""].filter(Boolean).join(" to ");

  function paintFind() {
    mount();
    const box = $("findBox"); if (!box) return;
    const s = curShow();
    const have = s ? leadsForShow(s).length : 0;
    const head = `<h3 style="margin:0 0 4px">Find exhibitors</h3>`;
    if (!st.connected) {
      box.innerHTML = head + `<p class="sub" style="margin:0">Let Claude search the web and the show's exhibitor directory for you, then review the list before importing. ${st.canEdit ? "Connect Claude in <a href=\"#settings\">Settings › Integrations</a> to turn this on." : "Ask an Owner or Manager to connect Claude in Settings › Integrations."}</p>`;
      return;
    }
    if (st.busy) { box.innerHTML = head + `<p style="margin:6px 0 0"><span class="spin" aria-hidden="true"></span> <b id="findTimer">${esc(st.busyMsg || "Working…")}</b></p><p class="sub" style="margin:4px 0 0">You can keep working in another tab. Don't close this page.</p>`; return; }
    box.innerHTML = head + `
      <p class="sub" style="margin:0 0 8px">${s ? `Claude searches the web and reads the show's exhibitor directory for <b>${esc(s.name)}</b>${have ? `, skipping the ${have} you already have` : ""}. You review the list before anything is imported.` : "Pick the show above first, or paste a directory page below."}</p>
      <div class="row" style="gap:8px;align-items:end">
        <label class="f" for="findUrl" style="flex:1;min-width:220px">Exhibitor directory link <span class="sub">(optional, helps a lot)</span><input id="findUrl" type="url" placeholder="https://… exhibitor list page" value="${esc(st.url || "")}"></label>
        <button class="btn primary" id="findGo" ${s ? "" : "disabled"}>${st.rows.length ? "Find more" : "Find exhibitors"}</button>
      </div>
      <details style="margin-top:8px"${st.pasteOpen ? " open" : ""} id="findPasteBox"><summary class="sub" style="cursor:pointer">Directory needs a login or won't load? Paste the page instead</summary>
        <p class="sub" style="margin:6px 0">Open the exhibitor list in your browser, press Ctrl+A (⌘A on Mac) then Ctrl+C, and paste here. Scroll to load the whole list first.</p>
        <textarea id="findText" rows="5" placeholder="Paste the exhibitor directory page here"></textarea>
        <div class="row" style="margin-top:6px"><button class="btn" id="findRead">Read pasted list</button></div>
      </details>
      ${st.err ? `<p class="err" style="margin:8px 0 0">${esc(st.err)}</p>` : ""}
      ${results()}`;
  }

  function results() {
    if (!st.rows.length) return st.note ? `<p class="sub" style="margin:10px 0 0">${esc(st.note)}</p>` : "";
    const n = st.picked.size;
    return `<div style="margin-top:14px">
      ${st.note ? `<p class="sub" style="margin:0 0 8px">${esc(st.note)}</p>` : ""}
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
        <b>${st.rows.length} exhibitors found</b>
        <span class="row" style="gap:6px"><button class="btn ghost" id="findAll">${n === st.rows.length ? "Clear all" : "Select all"}</button>
        <button class="btn primary" id="findUse" ${n ? "" : "disabled"}>Preview import of ${n}</button></span>
      </div>
      <div class="tablebox"><table class="small" style="min-width:640px"><thead><tr><th></th><th>Company</th><th>Industry</th><th>Booth</th><th>How we know</th></tr></thead><tbody>
      ${st.rows.map((r, i) => `<tr>
        <td><input type="checkbox" data-findpick="${i}" ${st.picked.has(i) ? "checked" : ""} aria-label="Include ${esc(r.company)}"></td>
        <td><div class="co">${esc(r.company)}</div>${r.website ? `<div class="sub">${esc(r.website)}</div>` : ""}</td>
        <td>${esc(r.industry || "")}</td>
        <td class="mono">${esc(r.booth || "")}</td>
        <td><span class="chip ${r.confidence === "confirmed" ? "ok" : "q"}">${r.confidence === "confirmed" ? "Confirmed" : "Likely"}</span>
          <div class="sub">${esc(r.evidence || "")}${r.source ? ` <a href="${esc(r.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ""}</div></td></tr>`).join("")}
      </tbody></table></div>
      <p class="sub" style="margin:6px 0 0">"Likely" means a third-party list or a company post, not the official directory. Check the source before you rely on it.</p>
    </div>`;
  }

  let timer = null;
  async function run(mode) {
    const s = curShow();
    const text = mode === "paste" ? ($("findText").value || "").trim() : "";
    if (mode === "paste" && text.length < 40) { st.err = "Paste the directory page text first."; paintFind(); return; }
    if (mode === "web" && !s) return;
    st.url = ($("findUrl") || {}).value || "";
    st.pasteOpen = mode === "paste";
    const exclude = [...(s ? leadsForShow(s).map((l) => l.company) : []), ...st.rows.map((r) => r.company)];
    st.busy = true; st.err = "";
    const t0 = Date.now();
    const label = () => mode === "paste" ? `Reading the pasted list… ${Math.round((Date.now() - t0) / 1000)}s` : `Searching the web and the show's directory… ${Math.round((Date.now() - t0) / 1000)}s (usually 1 to 3 minutes)`;
    st.busyMsg = label(); paintFind();
    timer = setInterval(() => { st.busyMsg = label(); const el = $("findTimer"); if (el) el.textContent = st.busyMsg; }, 1000);
    try {
      const r = await api("POST", "/api/exhibitors", { show: s ? s.name : "", dates: s ? fmtDates(s) : "", industry: s ? s.industry || "" : "", url: mode === "web" ? st.url : "", text, exclude });
      const start = st.rows.length;
      st.rows = st.rows.concat(r.rows || []);
      for (let i = start; i < st.rows.length; i++) st.picked.add(i);
      st.note = r.note || "";
      toast(r.rows && r.rows.length ? `Found ${r.rows.length} new exhibitor${r.rows.length === 1 ? "" : "s"}` : "No new exhibitors found");
      if (!(r.rows || []).length && !st.note) st.note = "No new exhibitors found. Try adding the directory link, or paste the directory page.";
    } catch (err) { st.err = err.message; }
    clearInterval(timer); st.busy = false; paintFind();
  }

  // Hand the picked rows to the normal import preview (column matching, merge by company, show tag).
  function useRows() {
    const q = (v) => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const s = curShow();
    const lines = ["company,website,industry,notes,source"];
    [...st.picked].sort((a, b) => a - b).forEach((i) => {
      const r = st.rows[i]; if (!r) return;
      const notes = [r.booth ? "Booth " + r.booth : "", r.confidence === "likely" ? "Exhibitor status: likely (" + (r.evidence || "third-party list") + ")" : r.evidence || "", r.source ? "Source: " + r.source : ""].filter(Boolean).join(". ");
      lines.push([r.company, r.website || "", r.industry || "", notes, (s ? s.name + " exhibitor list" : "Exhibitor directory") + " (found with Claude)"].map((v) => q(String(v))).join(","));
    });
    $("csvText").value = lines.join("\n");
    $("parseBtn").click();
    const p = $("importPreview"); if (p) p.scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Check the preview, then click Import");
  }

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.id === "claudeConnect") {
      const key = $("claudeKey").value.trim(); const msg = $("claudeMsg");
      t.disabled = true; msg.textContent = "Checking the key with Claude…";
      try { await api("PUT", "/api/claude", { key }); await refresh(); toast("Claude connected"); }
      catch (err) { msg.textContent = err.message; t.disabled = false; }
    }
    if (t.id === "claudeDisconnect") {
      if (!t.dataset.armed) { t.dataset.armed = "1"; t.textContent = "Click again to disconnect"; return; }
      try { await api("DELETE", "/api/claude"); await refresh(); toast("Claude disconnected"); } catch (err) { toast(err.message); }
    }
    if (t.id === "findGo") run("web");
    if (t.id === "findRead") run("paste");
    if (t.id === "findUse") useRows();
    if (t.id === "findAll") { if (st.picked.size === st.rows.length) st.picked.clear(); else st.rows.forEach((_, i) => st.picked.add(i)); paintFind(); }
  });
  document.addEventListener("change", (e) => {
    const c = e.target.closest("[data-findpick]"); if (!c) return;
    const i = +c.dataset.findpick; if (c.checked) st.picked.add(i); else st.picked.delete(i);
    const b = $("findUse"); if (b) { b.disabled = !st.picked.size; b.textContent = `Preview import of ${st.picked.size}`; }
    const a = $("findAll"); if (a) a.textContent = st.picked.size === st.rows.length ? "Clear all" : "Select all";
  });
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#settings")) refresh(); if (location.hash.startsWith("#sources/import")) paintFind(); });
  refresh();
})();
