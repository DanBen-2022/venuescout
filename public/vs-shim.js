/* VenueScout data bridge: gives the app the same db/downloads interface it had as an artifact,
   backed by the VenueScout API (Postgres) with polling for teammates' changes. */
(function () {
  const POLL_MS = 8000;
  const state = { data: null, json: {}, me: null, team: [], viewAs: null };
  const colListeners = []; // {col, cb}
  const docListeners = []; // {col, id, cb}
  let inflight = 0, writeSeq = 0, timer = null, loading = null;

  const VS = (window.VS = { me: null, team: [], viewAs: null, ready: null });
  let resolveReady; VS.ready = new Promise((r) => (resolveReady = r));

  function toLogin() { location.href = "/login"; }

  function colSnap(col) {
    const m = (state.data && state.data[col]) || {};
    return { docs: Object.entries(m).map(([id, d]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(d)) })), metadata: { fromCache: false } };
  }
  function docSnap(col, id) {
    const d = state.data && state.data[col] && state.data[col][id];
    return { id, exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) };
  }

  async function load() {
    if (loading) return loading;
    const seq = writeSeq;
    loading = (async () => {
      try {
        const r = await fetch("/api/all", { cache: "no-store", credentials: "same-origin" });
        if (r.status === 401) return toLogin();
        if (!r.ok) throw new Error("load " + r.status);
        const body = await r.json();
        if (inflight > 0 || seq !== writeSeq) { schedule(800); return; } // our own write is newer; fetch again shortly
        const first = !state.data;
        state.data = body.data;
        if (first || JSON.stringify(body.me) !== JSON.stringify(state.me) || JSON.stringify(body.team) !== JSON.stringify(state.team) || JSON.stringify(body.viewAs) !== JSON.stringify(state.viewAs)) {
          state.me = body.me; state.team = body.team; state.viewAs = body.viewAs || null; VS.me = body.me; VS.team = body.team; VS.viewAs = state.viewAs;
          paintUser();
          if (first) resolveReady(body.me);
        }
        for (const col of Object.keys(body.data)) {
          const j = JSON.stringify(body.data[col]);
          if (!first && state.json[col] === j) continue;
          state.json[col] = j;
          colListeners.filter((l) => l.col === col).forEach((l) => l.cb(colSnap(col)));
          docListeners.filter((l) => l.col === col).forEach((l) => l.cb(docSnap(col, l.id)));
        }
      } catch (e) {
        if (!state.data) [...colListeners, ...docListeners].forEach((l) => l.err && l.err(e));
      } finally { loading = null; }
    })();
    return loading;
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }
  function tick() { if (document.visibilityState === "visible") load().finally(() => schedule(POLL_MS)); else schedule(POLL_MS); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") schedule(50); });

  async function write(method, col, id, data) {
    inflight++; writeSeq++;
    try {
      const r = await fetch(`/api/c/${encodeURIComponent(col)}/${encodeURIComponent(id)}`, {
        method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: method === "PUT" ? JSON.stringify(data) : undefined,
      });
      if (r.status === 401) { toLogin(); throw Object.assign(new Error("signed out"), { code: "unauthenticated" }); }
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(body.error || "Save failed"), { code: r.status === 403 ? "forbidden" : "unavailable", status: r.status });
      if (state.data) {
        state.data[col] = state.data[col] || {};
        if (method === "PUT") state.data[col][id] = body.data || data; else delete state.data[col][id];
        state.json[col] = JSON.stringify(state.data[col]);
      }
    } finally { inflight--; schedule(1500); }
  }

  function docRef(col, id) {
    return {
      id,
      set: (data) => write("PUT", col, id, data),
      delete: () => write("DELETE", col, id),
      onSnapshot(cb, err) { const l = { col, id, cb, err }; docListeners.push(l); if (state.data) cb(docSnap(col, id)); else load(); return () => docListeners.splice(docListeners.indexOf(l), 1); },
    };
  }
  const db = {
    collection: (col) => ({
      doc: (id) => docRef(col, id),
      onSnapshot(cb, err) { const l = { col, cb, err }; colListeners.push(l); if (state.data) cb(colSnap(col)); else load(); return () => colListeners.splice(colListeners.indexOf(l), 1); },
    }),
    doc: (path) => { const [col, id] = path.split("/"); return docRef(col, id); },
  };
  const downloads = {
    async save({ filename, data, mimeType }) {
      const url = URL.createObjectURL(new Blob([data], { type: mimeType || "text/csv" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
  window.claude = { use: async (name) => (name === "db" ? db : name === "downloads" ? downloads : null) };

  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function paintUser() {
    const me = state.me; if (!me) return;
    document.body.classList.remove("role-owner", "role-manager", "role-sales");
    document.body.classList.add("role-" + me.role);
    const el = document.getElementById("userMenu"); if (!el) return;
    const cap = (r) => r[0].toUpperCase() + r.slice(1);
    const va = state.viewAs;
    if (va) {
      el.innerHTML = `<span class="who">${esc(va.by.name)} · ${cap(va.by.role)}</span><button type="button" id="viewAsExit">Exit View as</button>`;
      let bar = document.getElementById("viewAsBar");
      if (!bar) { bar = document.createElement("div"); bar.id = "viewAsBar"; bar.setAttribute("role", "status"); document.body.prepend(bar); }
      bar.innerHTML = `<span>Viewing as <b>${esc(me.name)}</b> · ${cap(me.role)}. This is exactly what they see. Changes are off.</span><button type="button" data-viewas-exit>Exit</button>`;
    } else {
      document.getElementById("viewAsBar")?.remove();
      const eligible = me.role === "sales" ? [] : state.team.filter((u) => u.id !== me.id && (me.role === "owner" || u.role === "sales"));
      el.innerHTML = `<span class="who">${esc(me.name)} · ${cap(me.role)}</span>`
        + (eligible.length ? `<select id="viewAsPick" aria-label="View as a teammate"><option value="">View as…</option>${eligible.map((u) => `<option value="${esc(u.id)}">${esc(u.name)} (${cap(u.role)})</option>`).join("")}</select>` : "")
        + `${me.role !== "sales" ? '<a href="/team">Team</a><a href="/audit">Audit log</a>' : ""}<button type="button" id="signOut">Sign out</button>`;
      document.getElementById("signOut").onclick = async () => { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); toLogin(); };
      const pick = document.getElementById("viewAsPick");
      if (pick) pick.onchange = async () => {
        if (!pick.value) return;
        const r = await fetch("/api/view-as", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: pick.value }) });
        if (r.ok) location.reload(); else { const j = await r.json().catch(() => ({})); alert(j.error || "Couldn't switch."); pick.value = ""; }
      };
    }
  }
  document.addEventListener("click", async (e) => {
    if (!(e.target.closest && e.target.closest("#viewAsExit,[data-viewas-exit]"))) return;
    await fetch("/api/view-as", { method: "DELETE", credentials: "same-origin" });
    location.reload();
  });
  VS.ownerName = (id) => (state.team.find((u) => u.id === id) || {}).name || "";
  schedule(POLL_MS);
})();
