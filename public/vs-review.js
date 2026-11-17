/* VenueScout: Review mode.
   Owners and Reviewers pin numbered comments to any spot in the app, reply to them and mark
   them resolved. Nobody else sees them: the API refuses other roles, and this file does nothing
   for them. Each pin remembers its tab, an anchor element and an offset inside it, so it stays
   put as lists grow, plus a small screenshot of the area as it looked.
   Loaded after the main script, which exposes its helpers as window.VSAPP. */
(function () {
  const A = window.VSAPP, VS = window.VS; if (!A || !VS || !VS.ready) return;
  const { S, esc, toast, openDrawer, MK } = A;
  const TAB = { today: "Today", prospects: "Prospects", markets: "Markets", sources: "Lead sources", results: "Results", help: "Help", settings: "Settings" };
  const OLD = { shows: "sources", import: "sources", criteria: "settings", budget: "results", plan: "markets" };
  const st = { me: null, canWrite: false, list: [], placing: false, open: null, draft: null, edit: null, arm: null, panel: false, filter: "open", busy: false, pins: true, sig: "" };
  try { st.pins = localStorage.getItem("vs_review_pins") !== "off"; } catch { /* private mode */ }
  const $ = (id) => document.getElementById(id);
  const when = (s) => new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const cap = (r) => (r ? r[0].toUpperCase() + r.slice(1) : "");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const byId = (id) => st.list.find((c) => c.id === id);
  const threads = () => st.list.filter((c) => !c.parentId);
  const replies = (id) => st.list.filter((c) => c.parentId === id);
  const mine = (c) => st.canWrite && st.me && c.authorId === st.me.id;

  // ---------- where am I ----------
  function tabNow() { const t = (location.hash.slice(1) || "today").split("/")[0]; return TAB[t] ? t : TAB[OLD[t]] ? OLD[t] : "today"; }
  function slideNow() { const m = /:\s(.*)$/.exec(($("hStage") && $("hStage").getAttribute("aria-label")) || ""); return m ? m[1] : ""; }
  // What is showing inside the tab: an open prospect, a Help slide or one market.
  function ctxNow() {
    if (document.querySelector("#drawerRoot .drawer") && S.open) return "lead:" + S.open;
    const t = tabNow(), sub = location.hash.slice(1).split("/")[1] || "";
    if (t === "help") return "slide:" + slideNow();
    if (t === "markets" && MK[sub]) return "market:" + sub;
    return "";
  }
  function labelNow() {
    const c = ctxNow();
    if (c.startsWith("lead:")) return "Prospect: " + ((S.leads.get(S.open) || {}).company || "");
    if (c.startsWith("slide:")) return c.slice(6);
    if (c.startsWith("market:")) return (MK[c.slice(7)] || {}).short || "";
    const sub = document.querySelector('#v-sources:not([hidden]) #srcTabs button[aria-selected="true"]');
    return sub ? sub.textContent.trim() : "";
  }

  // ---------- anchoring a pin to the page ----------
  function anchorEl(a) {
    if (!a) return null;
    if (a.t === "drawer") return document.querySelector("#drawerRoot .drawer");
    if (a.t === "row") return document.querySelector(`tr[data-id="${CSS.escape(String(a.v))}"]`);
    if (a.t === "id") return document.getElementById(String(a.v));
    return null;
  }
  const shown = (el) => !!el && el.getClientRects().length > 0;
  function pickAnchor(target) {
    const dr = target.closest(".drawer");
    const row = !dr && target.closest("tr[data-id]");
    if (row) return { t: "row", v: row.dataset.id };
    for (let el = target; el && el !== document.body && el !== dr; el = el.parentElement) {
      if (el.id && /^[A-Za-z][\w-]*$/.test(el.id) && shown(el) && document.querySelectorAll("#" + el.id).length === 1) return { t: "id", v: el.id };
    }
    return dr ? { t: "drawer" } : null;
  }
  function makePos(target, cx, cy) {
    const a = pickAnchor(target), el = anchorEl(a), de = document.documentElement;
    const pos = { a, ctx: ctxNow(), px: (cx + scrollX) / de.scrollWidth, py: Math.round(cy + scrollY), vw: innerWidth, drawer: !!target.closest(".drawer") };
    if (el) {
      const r = el.getBoundingClientRect();
      pos.fx = +clamp((cx - r.left) / (r.width || 1), 0, 1).toFixed(4);
      pos.oy = Math.round(cy - r.top + (a.t === "drawer" ? el.scrollTop : 0));
    }
    return pos;
  }
  // Viewport position of a comment's pin, or null when its spot isn't on screen right now.
  function locate(c) {
    const p = c.pos || {};
    if (c.tab !== tabNow() || (p.ctx || "") !== ctxNow()) return null;
    const el = anchorEl(p.a);
    if (shown(el)) {
      const r = el.getBoundingClientRect();
      return { x: r.left + (p.fx || 0) * r.width, y: p.a.t === "drawer" ? r.top + p.oy - el.scrollTop : r.top + Math.min(p.oy || 0, r.height) };
    }
    if (el || p.drawer || (p.a && p.a.t === "row")) return null; // its section or row is hidden for now
    if (typeof p.px !== "number") return null;
    return { x: p.px * document.documentElement.scrollWidth - scrollX, y: p.py - scrollY };
  }
  // Pins slide under the sticky headers instead of floating over them.
  function topEdge(c) {
    const a = (c.pos || {}).a;
    if (c.pos && c.pos.drawer) { const j = document.querySelector("#drawerRoot .djump") || document.querySelector("#drawerRoot .dhead"); return j ? j.getBoundingClientRect().bottom : 0; }
    const h = document.querySelector("body > header"), el = anchorEl(a);
    return h && !(el && h.contains(el)) ? h.getBoundingClientRect().bottom : 0;
  }

  // ---------- screenshot of the area around the click ----------
  let lib = null;
  function loadLib() {
    if (!lib) lib = new Promise((res, rej) => {
      if (window.modernScreenshot) return res(window.modernScreenshot);
      const s = document.createElement("script"); s.src = "/vendor/modern-screenshot.js";
      s.onload = () => (window.modernScreenshot ? res(window.modernScreenshot) : rej(new Error("no lib"))); s.onerror = rej;
      document.head.appendChild(s);
    });
    return lib;
  }
  const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  async function capture(target, cx, cy) {
    try {
      const ms = await loadLib();
      // Grow from the clicked element to the card or panel around it, without taking in a whole long list.
      const stop = (n) => !n || n === document.body || n.matches("main, section, header, .drawer, .dbody, #drawerRoot");
      let el = target.nodeType === 1 ? target : target.parentElement, temp = null;
      while (el.parentElement && !stop(el.parentElement) && el.parentElement.getBoundingClientRect().height <= 620) el = el.parentElement;
      const tr = el.closest("tr"), table = tr && tr.closest("table");
      if (table && table.getBoundingClientRect().height > 620 && tr.parentElement.tagName === "TBODY") {
        // A row of a long table: picture the header with this row and its neighbours, at the table's own width.
        const rows = [...tr.parentElement.children], i = rows.indexOf(tr), from = Math.max(0, i - 2);
        temp = table.cloneNode(false);
        if (table.tHead) temp.appendChild(table.tHead.cloneNode(true));
        const tb = document.createElement("tbody"); rows.slice(from, i + 3).forEach((x) => tb.appendChild(x.cloneNode(true))); temp.appendChild(tb);
        temp.removeAttribute("id"); temp.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
        temp.style.cssText += `;position:absolute;left:-20000px;top:0;width:${table.getBoundingClientRect().width}px;table-layout:${getComputedStyle(table).tableLayout}`;
        table.after(temp);
        const twin = tb.children[i - from].getBoundingClientRect(), was = tr.getBoundingClientRect();
        cx += twin.left - was.left; cy += twin.top - was.top; el = temp;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) { if (temp) temp.remove(); return null; }
      const scale = clamp(1000 / r.width, 0.6, 1.5);
      const canvas = await within(ms.domToCanvas(el, {
        scale, backgroundColor: getComputedStyle(document.body).backgroundColor, timeout: 4000,
        filter: (n) => !(n.id === "rvRoot" || n.id === "toastRoot"),
      }), 8000).finally(() => { if (temp) temp.remove(); });
      const g = canvas.getContext("2d"), x = (cx - r.left) * scale, y = (cy - r.top) * scale;
      g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fillStyle = "rgba(168,135,79,.28)"; g.fill();
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fillStyle = "#a8874f"; g.fill(); g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke();
      let out = canvas.toDataURL("image/jpeg", 0.82);
      if (out.length > 600000) out = canvas.toDataURL("image/jpeg", 0.5);
      return out.length < 880000 && out.startsWith("data:image/jpeg") ? out : null;
    } catch { return null; } // a comment is still worth saving without its picture
  }

  // ---------- server ----------
  async function api(method, path, body) {
    const r = await fetch("/api/review" + (path || ""), { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { status: r.status });
    return j;
  }
  async function load(first) {
    try {
      const j = await api("GET");
      st.me = j.me; st.canWrite = !!j.canWrite; st.list = j.comments || [];
      if (st.open && !byId(st.open)) st.open = null;
      const sig = JSON.stringify(st.list);
      if (sig !== st.sig || first) { st.sig = sig; paint(true); }
    } catch (e) { if (first) throw e; }
  }
  const put = (c) => { const i = st.list.findIndex((x) => x.id === c.id); if (i < 0) st.list.push(c); else st.list[i] = c; st.sig = JSON.stringify(st.list); };
  async function run(fn) {
    if (st.busy) return; st.busy = true;
    try { await fn(); } catch (e) { toast(e.message); if (e.status === 404) await load(); }
    st.busy = false; paint();
  }

  // ---------- drawing ----------
  const CSS_TEXT = `
#rvRoot{font-family:var(--f-body);font-size:14px;color:var(--fg)}
#rvPins{position:fixed;inset:0;pointer-events:none;z-index:30;overflow:hidden}
.rvpin{position:absolute;width:28px;height:28px;margin:-34px 0 0 -14px;padding:0;border:2px solid var(--surface);border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--gold);color:#141414;cursor:pointer;pointer-events:auto;box-shadow:0 2px 8px rgba(0,0,0,.28)}
.rvpin span{display:block;transform:rotate(45deg);font:600 12px/24px var(--f-body);text-align:center}
.rvpin:hover,.rvpin[aria-expanded="true"]{background:var(--fg);color:var(--bg)}
.rvpin.done{background:var(--sunk);color:var(--muted);border-color:var(--line)}
.rvpin.draft{background:var(--fg);color:var(--bg);pointer-events:none}
#rvFab{position:fixed;right:max(18px,env(safe-area-inset-right,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:30;display:flex;gap:8px;align-items:center}
#rvFab .btn{padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,.16)}
#rvFab .cnt{display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;background:var(--gold);color:#141414;font-weight:600;text-align:center}
#rvHint{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:70;display:flex;gap:14px;align-items:center;background:var(--fg);color:var(--bg);padding:9px 14px;border-radius:var(--r);box-shadow:0 4px 18px rgba(0,0,0,.25);max-width:calc(100vw - 24px)}
#rvHint button{font:inherit;font-weight:600;background:none;border:1px solid currentColor;color:inherit;padding:2px 10px;border-radius:var(--r);cursor:pointer}
body.rv-placing,body.rv-placing *{cursor:crosshair !important}
body.rv-placing #rvRoot,body.rv-placing #rvRoot *{cursor:auto !important}
#rvPop{position:fixed;z-index:31;width:340px;max-width:calc(100vw - 16px);max-height:min(560px,calc(100vh - 16px));display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-top:2px solid var(--gold);border-radius:var(--r);box-shadow:0 10px 34px rgba(0,0,0,.22)}
#rvPop:empty,#rvPanel:empty,#rvShot:empty,#rvHint:empty{display:none}
.rvh{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)}
.rvh b{font-family:var(--f-display);font-size:19px;font-weight:600;line-height:1.1}
.rvh .x{margin-left:auto;font:inherit;font-size:16px;background:none;border:0;color:var(--muted);cursor:pointer;padding:2px 6px}
.rvnum{flex:none;width:22px;height:22px;border-radius:50%;background:var(--gold);color:#141414;font:600 11px/22px var(--f-body);text-align:center}
.rvnum.done{background:var(--sunk);color:var(--muted)}
.rvb{padding:4px 12px;overflow-y:auto}
.rvmsg{padding:9px 0;border-bottom:1px solid var(--line)}
.rvmsg:last-child{border-bottom:0}
.rvmsg.reply{padding-left:12px;border-left:2px solid var(--line);margin-left:2px}
.rvmeta{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
.rvtext{white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0 0;line-height:1.45}
.rvact{display:flex;gap:12px;margin-top:5px;flex-wrap:wrap}
.rvlink{font:inherit;font-size:12px;color:var(--muted);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.rvlink:hover{color:var(--fg)}.rvlink.bad{color:var(--bad)}
.rvf{padding:10px 12px;border-top:1px solid var(--line);display:grid;gap:8px}
#rvRoot textarea,#rvSettings textarea{font:14px/1.4 var(--f-body);resize:vertical;min-height:64px}
.rvrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#rvPanel{position:fixed;top:0;right:0;bottom:0;z-index:32;width:min(400px,100%);background:var(--bg);border-left:1px solid var(--line);box-shadow:-8px 0 30px rgba(0,0,0,.14);display:flex;flex-direction:column}
#rvPanel .rvb{flex:1;padding:8px 14px 80px}
.rvfilters{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 4px}
.rvfilters button{font:500 12px var(--f-body);padding:4px 10px;border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:var(--r);cursor:pointer}
.rvfilters button[aria-pressed="true"]{color:var(--fg);border-color:var(--gold)}
.rvgroup{font:500 11px var(--f-body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:16px 0 4px}
.rvitem{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;font:inherit;color:inherit;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:10px;margin:0 0 6px;cursor:pointer}
.rvitem:hover{border-color:var(--gold)}
.rvitem.done{opacity:.72}
.rvitem .body{flex:1;min-width:0}
.rvitem img{flex:none;width:120px;height:72px;object-fit:cover;object-position:top left;border:1px solid var(--line);background:var(--sunk)}
.rvsnip{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;margin:2px 0}
#rvShot{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:24px;cursor:zoom-out}
#rvShot img{max-width:100%;max-height:calc(100vh - 48px);background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.4)}
@media (max-width:520px){#rvPop{left:8px !important;right:8px;top:auto !important;bottom:8px;width:auto;max-height:70vh}#rvFab .long{display:none}.rvitem img{display:none}}
@media print{#rvRoot{display:none}}
`;

  const openCount = () => threads().filter((t) => !t.resolvedAt).length;
  const where = (t) => esc(TAB[t.tab] || "Page") + (t.label ? ` <span class="sub">· ${esc(t.label)}</span>` : "");
  const meta = (c) => `<div class="rvmeta"><b>${esc(c.author || "Someone")}</b><span class="sub">${c.authorRole ? esc(cap(c.authorRole)) + " · " : ""}${esc(when(c.createdAt))}${c.editedAt ? " · edited" : ""}</span></div>`;

  function msgHtml(c, isReply) {
    if (st.edit === c.id) return `<div class="rvmsg ${isReply ? "reply" : ""}">${meta(c)}
      <textarea id="rvEdit" maxlength="4000" aria-label="Edit comment">${esc(c.body)}</textarea>
      <div class="rvrow" style="margin-top:6px"><button class="btn primary" data-rv="save-edit" data-id="${c.id}">Save</button><button class="btn ghost" data-rv="cancel-edit">Cancel</button></div></div>`;
    return `<div class="rvmsg ${isReply ? "reply" : ""}">${meta(c)}<p class="rvtext">${esc(c.body)}</p>
      <div class="rvact">${c.hasShot ? `<button class="rvlink" data-rv="shot" data-id="${c.id}">View screenshot</button>` : ""}
      ${mine(c) ? `<button class="rvlink" data-rv="edit" data-id="${c.id}">Edit</button>${st.arm === c.id
        ? `<button class="rvlink bad" data-rv="del" data-id="${c.id}">Confirm delete${!isReply && replies(c.id).length ? " (with replies)" : ""}</button>`
        : `<button class="rvlink" data-rv="arm" data-id="${c.id}">Delete</button>`}` : ""}</div></div>`;
  }

  function popHtml() {
    if (st.draft) return `<div class="rvh"><span class="rvnum">+</span><b>New comment</b><span class="sub">· ${where(st.draft)}</span><button class="x" data-rv="cancel-new" aria-label="Cancel">✕</button></div>
      <div class="rvf"><textarea id="rvNew" maxlength="4000" placeholder="What do you notice here? What would you change?" aria-label="Comment"></textarea>
      <div class="rvrow"><button class="btn primary" data-rv="save-new">Save comment</button><button class="btn ghost" data-rv="cancel-new">Cancel</button></div>
      <span class="sub">Only Owners and Reviewers see comments.</span></div>`;
    const t = st.open && byId(st.open); if (!t) return "";
    const rs = replies(t.id);
    return `<div class="rvh"><span class="rvnum ${t.resolvedAt ? "done" : ""}">${t.num || ""}</span><b>${esc(TAB[t.tab] || "Page")}</b>${t.label ? `<span class="sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.label)}</span>` : ""}
        ${t.resolvedAt ? '<span class="chip ok">Resolved</span>' : ""}<button class="x" data-rv="close" aria-label="Close">✕</button></div>
      <div class="rvb">${msgHtml(t, false)}${rs.map((r) => msgHtml(r, true)).join("")}</div>
      ${st.canWrite ? `<div class="rvf">${t.resolvedAt ? `<span class="sub">Resolved by ${esc(t.resolvedBy || "someone")} on ${esc(when(t.resolvedAt))}.</span>` : `<textarea id="rvReply" maxlength="4000" placeholder="Reply…" aria-label="Reply" style="min-height:44px"></textarea>`}
        <div class="rvrow">${t.resolvedAt ? `<button class="btn" data-rv="reopen" data-id="${t.id}">Reopen</button>` : `<button class="btn primary" data-rv="reply" data-id="${t.id}">Reply</button><button class="btn" data-rv="resolve" data-id="${t.id}">Mark resolved</button>`}</div></div>` : ""}`;
  }

  function listHtml(withShots) {
    const all = threads(), nOpen = all.filter((t) => !t.resolvedAt).length;
    const pick = all.filter((t) => (st.filter === "all" ? true : st.filter === "resolved" ? t.resolvedAt : !t.resolvedAt));
    const f = (k, l) => `<button data-rv="filter" data-f="${k}" aria-pressed="${st.filter === k}">${l}</button>`;
    let out = `<div class="rvfilters">${f("open", `Open (${nOpen})`)}${f("resolved", `Resolved (${all.length - nOpen})`)}${f("all", `All (${all.length})`)}</div>`;
    if (!all.length) return out + `<p class="sub" style="margin:10px 0 0">No comments yet. ${st.canWrite ? "Click Comment at the bottom right of any page, then click the spot you want to talk about." : ""}</p>`;
    if (!pick.length) return out + `<p class="sub" style="margin:10px 0 0">Nothing here.</p>`;
    const order = Object.keys(TAB);
    for (const tab of [...order, ...new Set(pick.map((t) => t.tab).filter((x) => !order.includes(x)))]) {
      const items = pick.filter((t) => t.tab === tab); if (!items.length) continue;
      out += `<div class="rvgroup">${esc(TAB[tab] || "Other")} · ${items.length}</div>` + items.map((t) => { const n = replies(t.id).length; return `<button class="rvitem ${t.resolvedAt ? "done" : ""}" data-rv="jump" data-id="${t.id}">
        <span class="rvnum ${t.resolvedAt ? "done" : ""}">${t.num || ""}</span>
        <span class="body"><span class="rvmeta"><b>${esc(t.author || "")}</b><span class="sub">${esc(when(t.createdAt))}${t.label ? " · " + esc(t.label) : ""}</span></span>
          <span class="rvsnip">${esc(t.body)}</span>
          <span class="sub">${n ? `${n} ${n === 1 ? "reply" : "replies"}` : "No replies"}${t.resolvedAt ? ` · resolved by ${esc(t.resolvedBy || "someone")}` : ""}</span></span>
        ${withShots && t.hasShot ? `<img src="/api/review/${t.id}" alt="Screenshot of the area for comment ${t.num}" loading="lazy">` : ""}</button>`; }).join("");
    }
    return out;
  }

  let pinsHtml = null;
  function paintPins() {
    const layer = $("rvPins"); if (!layer) return;
    const show = threads().filter((t) => t.id === st.open || (st.pins && !t.resolvedAt));
    let html = "";
    for (const t of show) {
      const p = locate(t); if (!p || p.y < topEdge(t) || p.y > innerHeight + 40) continue;
      html += `<button class="rvpin ${t.resolvedAt ? "done" : ""}" data-rv="pin" data-id="${t.id}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px" aria-expanded="${st.open === t.id}" aria-label="Comment ${t.num} by ${esc(t.author || "")}"><span>${t.num || ""}</span></button>`;
    }
    if (st.draft) { const p = locate(st.draft); if (p) html += `<span class="rvpin draft" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px"><span>+</span></span>`; }
    if (pinsHtml !== html) { layer.innerHTML = html; pinsHtml = html; }
    placePop();
  }
  function placePop() {
    const el = $("rvPop"); if (!el || !el.firstChild) return;
    const c = st.draft || (st.open && byId(st.open)), a = c ? locate(c) : null;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = innerWidth - w - 20, y = 90;
    if (a && a.y > -40 && a.y < innerHeight + 40) { x = a.x + 22; if (x + w > innerWidth - 8) x = a.x - w - 22; y = a.y - 40; }
    el.style.left = clamp(x, 8, Math.max(8, innerWidth - w - 8)) + "px";
    el.style.top = clamp(y, 8, Math.max(8, innerHeight - h - 8)) + "px";
  }
  // keepTyping: a background refresh must not wipe a half-written reply.
  function paint(keepTyping) {
    if (!$("rvRoot")) return;
    document.body.classList.toggle("rv-placing", st.placing);
    $("rvHint").innerHTML = st.placing ? `<span>Click the spot you want to comment on.</span><button data-rv="cancel-place">Cancel (Esc)</button>` : "";
    const n = openCount();
    $("rvFab").innerHTML = st.panel ? "" : `<button class="btn" data-rv="panel" aria-label="${n} open comments">Comments<span class="cnt">${n}</span></button>`
      + (st.canWrite ? `<button class="btn primary" data-rv="add">+ <span class="long">Add a </span>comment</button>` : "");
    const pop = $("rvPop"), typing = keepTyping && [...pop.querySelectorAll("textarea")].some((t) => t.value.trim());
    if (!typing) { pop.innerHTML = popHtml(); pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", st.draft ? "New comment" : "Comment"); }
    $("rvPanel").innerHTML = st.panel ? `<div class="rvh"><b>Review comments</b><button class="x" data-rv="panel" aria-label="Close">✕</button></div>
      <div class="rvb"><label class="rvrow sub" style="margin:8px 0 2px"><input type="checkbox" data-rv="pins" style="width:auto;margin:0" ${st.pins ? "checked" : ""}> Show pins on the pages</label>${listHtml(false)}</div>` : "";
    const sl = $("rvList"); if (sl) sl.innerHTML = listHtml(true);
    const chip = $("rvChip"); if (chip) { chip.textContent = n ? `${n} open` : "None open"; chip.className = "chip " + (n ? "q" : "ok"); }
    pinsHtml = null; paintPins();
  }

  // ---------- actions ----------
  function startPlacing() { st.placing = true; st.open = null; st.draft = null; st.edit = null; st.panel = false; paint(); }
  function startDraft(target, cx, cy) {
    st.placing = false;
    st.draft = { tab: tabNow(), route: location.hash.slice(1) || "today", label: labelNow(), pos: makePos(target, cx, cy), shot: capture(target, cx, cy) };
    paint(); const ta = $("rvNew"); if (ta) ta.focus();
  }
  function scrollToPin(t) {
    const p = t.pos || {}, el = anchorEl(p.a), dr = document.querySelector("#drawerRoot .drawer");
    if (shown(el)) {
      if (p.a.t === "drawer") { el.scrollTop = Math.max(0, p.oy - el.clientHeight / 2); return; }
      const r = el.getBoundingClientRect(), y = r.top + Math.min(p.oy || 0, r.height);
      if (dr && dr.contains(el)) dr.scrollTop += y - dr.getBoundingClientRect().top - dr.clientHeight / 2;
      else window.scrollTo({ top: Math.max(0, y + scrollY - innerHeight / 2) });
    } else if (!p.drawer && typeof p.py === "number") window.scrollTo({ top: Math.max(0, p.py - innerHeight / 2) });
  }
  // Go to where a comment was left: its tab, its prospect or Help slide, then its spot.
  function jump(id) {
    const t = byId(id); if (!t) return;
    const ctx = (t.pos || {}).ctx || "";
    st.panel = false; st.draft = null; st.edit = null;
    if (!ctx.startsWith("lead:") && S.open) document.querySelector("#drawerRoot [data-close]")?.click();
    const want = t.route || t.tab || "today";
    if ((location.hash.slice(1) || "today") !== want) location.hash = want;
    setTimeout(() => {
      if (ctx.startsWith("lead:")) {
        const lid = ctx.slice(5);
        if (!S.leads.get(lid)) toast("That prospect isn't in your list any more.");
        else if (S.open !== lid) openDrawer(lid);
      } else if (ctx.startsWith("slide:") && slideNow() !== ctx.slice(6)) {
        [...document.querySelectorAll("#helpBox [data-hto]")].find((b) => (b.getAttribute("aria-label") || "").endsWith(": " + ctx.slice(6)))?.click();
      }
      setTimeout(() => { scrollToPin(t); st.open = id; paint(); }, 140);
    }, 90);
  }

  const val = (id) => (($(id) || {}).value || "").trim();
  async function act(b) {
    const a = b.dataset.rv, id = b.dataset.id;
    if (a === "add") return startPlacing();
    if (a === "cancel-place") { st.placing = false; return paint(); }
    if (a === "panel") { st.panel = !st.panel; return paint(); }
    if (a === "close") { st.open = null; st.edit = null; st.arm = null; return paint(); }
    if (a === "cancel-new") { st.draft = null; return paint(); }
    if (a === "pin") { st.open = st.open === id ? null : id; st.draft = null; st.edit = null; st.arm = null; return paint(); }
    if (a === "jump") return jump(id);
    if (a === "filter") { st.filter = b.dataset.f; return paint(); }
    if (a === "edit") { st.edit = id; st.arm = null; paint(); const ta = $("rvEdit"); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } return; }
    if (a === "cancel-edit") { st.edit = null; return paint(); }
    if (a === "arm") { st.arm = id; return paint(); }
    if (a === "shot") { $("rvShot").innerHTML = `<img src="/api/review/${encodeURIComponent(id)}" alt="Screenshot saved with the comment">`; return; }
    if (a === "save-new") {
      const body = val("rvNew"), d = st.draft; if (!d) return; if (!body) return toast("Write a comment first.");
      b.disabled = true; b.textContent = "Saving…";
      return run(async () => {
        const shot = await d.shot;
        const j = await api("POST", "", { tab: d.tab, route: d.route, label: d.label, pos: d.pos, body, shot });
        put(j.comment); st.draft = null; st.open = j.comment.id; toast("Comment saved");
      });
    }
    if (a === "save-edit") { const body = val("rvEdit"); if (!body) return toast("Write a comment first."); return run(async () => { put((await api("PATCH", "/" + id, { body })).comment); st.edit = null; }); }
    if (a === "reply") { const body = val("rvReply"); if (!body) return toast("Write a reply first."); return run(async () => { put((await api("POST", "", { parentId: id, body })).comment); }); }
    if (a === "resolve" || a === "reopen") return run(async () => {
      const body = a === "resolve" ? val("rvReply") : "";
      if (body) put((await api("POST", "", { parentId: id, body })).comment);
      put((await api("PATCH", "/" + id, { resolved: a === "resolve" })).comment);
      if (a === "resolve") { st.open = null; toast("Resolved. It stays in the history."); }
    });
    if (a === "del") return run(async () => {
      await api("DELETE", "/" + id);
      st.list = st.list.filter((c) => c.id !== id && c.parentId !== id); st.sig = JSON.stringify(st.list);
      st.arm = null; if (st.open === id) st.open = null;
    });
  }

  function start() {
    const css = document.createElement("style"); css.textContent = CSS_TEXT; document.head.appendChild(css);
    const root = document.createElement("div"); root.id = "rvRoot";
    root.innerHTML = '<div id="rvPins"></div><div id="rvFab"></div><div id="rvHint" role="status"></div><div id="rvPop"></div><aside id="rvPanel" aria-label="Review comments"></aside><div id="rvShot" data-rv-shot></div>';
    document.body.appendChild(root);
    // Settings: every comment, grouped by tab, with its screenshot.
    const set = document.querySelector("#v-settings h2");
    if (set) set.insertAdjacentHTML("afterend", `<div id="rvSettings"><h3 style="margin:18px 0 6px" id="review">Review comments</h3>
      <p class="lede">Notes pinned to the site during a review, tab by tab. Only Owners and Reviewers can see them. Click one to go to its spot.</p>
      <div class="sec" style="margin-bottom:24px"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>All comments</h3><span class="chip" id="rvChip"></span></div><div id="rvList"></div></div></div>`);

    document.addEventListener("click", (e) => {
      const t = e.target; if (!t.closest) return;
      if (t.closest("#rvShot")) { $("rvShot").innerHTML = ""; return; }
      if (st.placing && !t.closest("#rvRoot")) { e.preventDefault(); e.stopPropagation(); startDraft(t, e.clientX, e.clientY); return; }
      const b = t.closest("[data-rv]"); if (!b || !b.closest("#rvRoot,#rvSettings") || b.tagName === "INPUT") return;
      e.preventDefault(); act(b);
    }, true);
    // While placing, a press shouldn't open a menu or move focus before the click lands.
    document.addEventListener("mousedown", (e) => { if (st.placing && e.target.closest && !e.target.closest("#rvRoot")) e.preventDefault(); }, true);
    document.addEventListener("change", (e) => {
      if (e.target.dataset && e.target.dataset.rv === "pins") { st.pins = e.target.checked; try { localStorage.setItem("vs_review_pins", st.pins ? "on" : "off"); } catch { /* private mode */ } paint(); }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if ($("rvShot").firstChild) { $("rvShot").innerHTML = ""; e.stopPropagation(); }
        else if (st.placing) { st.placing = false; paint(); e.stopPropagation(); }
        else if (st.draft && !val("rvNew")) { st.draft = null; paint(); e.stopPropagation(); }
        else if (st.open && !st.edit && !val("rvReply")) { st.open = null; paint(); e.stopPropagation(); }
        else if (st.panel) { st.panel = false; paint(); e.stopPropagation(); }
        return;
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target.closest && e.target.closest("#rvPop")) {
        const b = $("rvPop").querySelector('[data-rv="save-new"],[data-rv="save-edit"],[data-rv="reply"]'); if (b) { e.preventDefault(); act(b); }
      }
    }, true);

    let raf = 0; const again = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paintPins(); }); };
    window.addEventListener("scroll", again, { capture: true, passive: true });
    window.addEventListener("resize", again);
    window.addEventListener("hashchange", () => {
      if (st.draft) st.draft = null;
      if (st.open && !locate(byId(st.open) || {})) st.open = null;
      setTimeout(() => paint(true), 30);
      if (location.hash === "#settings/review") setTimeout(() => { const el = $("review"); if (el) el.scrollIntoView({ block: "start" }); }, 60);
    });
    setInterval(paintPins, 600); // lists re-render and drawers open without telling us
    setInterval(() => { if (document.visibilityState === "visible" && !st.busy) load(); }, 15000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(); });
    if (location.hash === "#settings/review") setTimeout(() => { const el = $("review"); if (el) el.scrollIntoView({ block: "start" }); }, 200);
  }

  VS.ready.then((me) => {
    if (!me || (me.role !== "owner" && me.role !== "reviewer")) return;
    load(true).then(start).then(() => paint(), () => {}); // refused (wrong role, or previewing as a teammate): stay invisible
  });
})();
