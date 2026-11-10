"""Builds public/app.html (the web console) from the single-file VenueScout page.

Usage: python3 scripts/build-web.py path/to/venuescout.html
Adds the full HTML document wrapper, the API data bridge (vs-shim.js), the signed-in
user menu, prospect owners and the Owner filter, and hides Results for Sales.
"""
import sys, pathlib

src = open(sys.argv[1]).read()

def rep(old, new):
    global src
    assert src.count(old) == 1, (old[:70], src.count(old))
    src = src.replace(old, new)

rep('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
rep('<a href="#settings" class="setlink" id="setLink">Settings</a></span>',
    '<a href="#settings" class="setlink" id="setLink">Settings</a><span class="usermenu" id="userMenu"></span></span>')
rep('</style>\n', '''.usermenu{display:flex;gap:12px;align-items:center;font-size:13px;color:var(--muted)}
.usermenu a,.usermenu button{font:inherit;color:var(--fg);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--line)}
body.role-sales [data-tab=results]{display:none}
@media (max-width:640px){.usermenu .who{display:none}}
</style>
''')
rep('<select id="fShow" aria-label="Source"><option value="">All sources</option></select>',
    '<select id="fShow" aria-label="Source"><option value="">All sources</option></select>\n'
    '      <select id="fOwner" aria-label="Owner"><option value="">Everyone\'s prospects</option><option value="me">My prospects</option><option value="-">Unassigned</option></select>')
rep('["#q","#fMarket","#fShow","#fType"', '["#q","#fMarket","#fShow","#fOwner","#fType"')
rep('    if (fp && (l.priority || 0) < fp) return false;',
    '    const fo = $("#fOwner").value; if (fo === "me" && l.owner !== window.VS?.me?.id) return false; if (fo === "-" && l.owner) return false;\n'
    '    if (fp && (l.priority || 0) < fp) return false;')
rep('${showOf(l)?" · show week: "+esc(showOf(l).name):""}</div>${quickLinks(l)}${l.example',
    '${showOf(l)?" · show week: "+esc(showOf(l).name):""}${l.owner&&window.VS?" · "+esc(window.VS.ownerName(l.owner)):""}</div>${quickLinks(l)}${l.example')
rep('        <label class="f" for="d_channel">Lead channel',
    '        <label class="f" for="d_owner">Owner (who works this prospect)<select id="d_owner"><option value="">Unassigned</option>${ownerOptions(l.owner)}</select></label>\n'
    '        <label class="f" for="d_channel">Lead channel')
rep('const FIELDS = ["show",', '''function ownerOptions(cur){
  const vs = window.VS || {}; const me = vs.me; let team = vs.team || [];
  if (me && me.role === "sales") team = team.filter(u => u.id === me.id || u.id === cur);
  return team.map(u => `<option value="${esc(u.id)}" ${u.id===cur?"selected":""}>${esc(u.name)}${me&&u.id===me.id?" (me)":""}</option>`).join("");
}
const FIELDS = ["owner","show",''')
rep('function handleWriteError(e){\n', '''function handleWriteError(e){
  if (e && e.code === "unauthenticated") return;
  if (e && e.code === "forbidden"){ toast(e.message || "Your role can't change that."); return; }
''')

INTEGRATIONS = [
    ("Gmail", "Email", "live", "Every email draft has an Open in Gmail button that fills in the recipient, subject and message.",
     "Next: send from VenueScout and log replies on the prospect. Needs a Google sign-in set up for your Google Workspace."),
    ("ZoomInfo or Cognism", "Contact data", "planned", "Alternatives to Apollo for verified emails and direct phones.", "Connects with an API key from your plan."),
    ("Clay", "Research", "planned", "Check whether each company has hosted events before and how big.", "Connects with a webhook."),
    ("Apify", "Scraper", "planned", "Pull exhibitor lists from show sites whose terms allow it, straight into Import a list.", "Connects with an API key."),
    ("Make", "Automation", "planned", "Push leads in from forms and other tools, and send updates out.", "Connects with a webhook."),
    ("Google Calendar", "Calendar", "planned", "Book site tours from a prospect and move it to Meeting set.", "Uses the same Google sign-in as Gmail."),
    ("Slack", "Alerts", "planned", "A morning digest of the Today list, and an alert when a new qualified buyer appears.", "Connects with a Slack app."),
    ("LinkedIn Sales Navigator, SponsorUnited, Cvent", "Lists", "csv", "No open connection is offered. Export a list to CSV, then use Lead sources, Import a list.", ""),
]
LABEL = {"live": "Working now", "next": "Next to build", "planned": "Planned", "csv": "Use CSV import"}
cards = "".join(
    f'<div class="sec intg"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>{n}</h3>'
    f'<span class="chip {"ok" if st == "live" else "q" if st == "next" else ""}">{LABEL[st]}</span></div>'
    f'<div class="sub" style="margin-bottom:6px">{k}</div><p style="margin:0 0 6px">{d}</p>'
    + (f'<p class="sub" style="margin:0">{h}</p>' if h else '') + '</div>'
    for n, k, st, d, h in INTEGRATIONS)
apollo_card = ('<div class="sec intg" id="apolloCard"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>Apollo</h3>'
    '<span class="chip" id="apolloChip">Checking…</span></div><div class="sub" style="margin-bottom:6px">Contact data</div>'
    '<p style="margin:0 0 6px">Find the people who run events at a prospect and add them with their work email, in one click from the prospect.</p>'
    '<div id="apolloCtl"></div></div>')
ts_card = ('<div class="sec intg" id="tsCard"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>Tripleseat</h3>'
    '<span class="chip" id="tsChip">Checking…</span></div><div class="sub" style="margin-bottom:6px">Booking system</div>'
    '<p style="margin:0 0 6px">See in every prospect whether the company has booked with you before, and mark past clients in one click.</p>'
    '<div id="tsCtl"></div><p class="sub" style="margin:8px 0 0">Coming next: mark a prospect Won from its Tripleseat booking, and send new prospects to Tripleseat as leads.</p></div>')
claude_card = ('<div class="sec intg" id="claudeCard"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>Claude</h3>'
    '<span class="chip" id="claudeChip">Checking…</span></div><div class="sub" style="margin-bottom:6px">AI research</div>'
    '<p style="margin:0 0 6px">Find a trade show\'s exhibitors for you: Claude searches the web and reads the show\'s directory, then you review the list before importing.</p>'
    '<div id="claudeCtl"></div></div>')
def tool_card(n, label, kind, desc):
    return (f'<div class="sec intg" id="{n}Card"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>{label}</h3>'
        f'<span class="chip" id="{n}Chip">Checking…</span></div><div class="sub" style="margin-bottom:6px">{kind}</div>'
        f'<p style="margin:0 0 6px">{desc}</p><div id="{n}Ctl"></div></div>')
pplx_card = tool_card("perplexity", "Perplexity", "News and research for Scout", "Cited news searches that tell Scout who has a reason to host an event now: deals, funding rounds, new offices, launches, galas.")
places_card = tool_card("places", "Google Places", "Local businesses for Scout", "Lists local partners by type and neighborhood (planners, synagogue event offices, florists, hotels) for weddings, mitzvahs and referrals.")
grok_card = tool_card("grok", "Grok", "X posts for Scout (optional)", "Reads recent posts on X, where fashion, media and entertainment news often breaks first.")
cards = cards.replace('<div class="sec intg"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>ZoomInfo',
    ts_card + apollo_card + claude_card + pplx_card + places_card + grok_card + '<div class="sec intg"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>ZoomInfo', 1)
assert 'tsCard' in cards
assert 'apolloCard' in cards
rep('<button class="btn" id="addContact">Add person</button>',
    '<span class="row" style="gap:6px"><button class="btn" id="apolloFind">Find with Apollo</button><button class="btn" id="addContact">Add person</button></span>')
rep('      <div class="sec" id="dScore"></div>\n', '      <div class="sec" id="dScore"></div>\n      <div id="tsBox"></div>\n')
rep('        <div id="contacts"></div></div>', '        <div id="apolloBox"></div><div id="contacts"></div></div>')
rep('        ${field("d_eventDate","Event date",l.eventDate,"date")}\n      </div></div>', '        ${field("d_eventDate","Event date",l.eventDate,"date")}\n      </div><div id="apolloOrg"></div></div>')
rep('body.role-sales [data-tab=results]{display:none}', '''body.role-sales [data-tab=results]{display:none}
:root[data-theme="light"]{color-scheme:light}
body:not(.apollo-on) #apolloFind,body:not(.apollo-on) #apolloOrg{display:none}
.orgcard{display:flex;gap:12px;align-items:flex-start}.orgcard img{width:36px;height:36px;border-radius:6px;object-fit:contain;background:#fff;border:1px solid var(--line)}
.orgfacts{display:flex;flex-wrap:wrap;gap:4px 14px;margin:4px 0}
#viewAsBar{position:sticky;top:0;z-index:60;display:flex;gap:14px;justify-content:center;align-items:center;flex-wrap:wrap;padding:9px 16px;background:var(--accent);color:var(--accent-ink);font-size:14px}
#viewAsBar button{font:inherit;font-weight:600;background:none;border:1px solid currentColor;color:inherit;padding:3px 12px;border-radius:4px;cursor:pointer}
.usermenu select{font:inherit;font-size:13px;width:auto;padding:3px 6px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:4px}
.apbox{background:var(--bg2,rgba(0,0,0,.02));border:1px solid var(--line);border-radius:8px;padding:12px;margin:8px 0}
.aplist{list-style:none;margin:0;padding:0}.aprow{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line)}
.linkish{font:inherit;color:var(--fg);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}''')
rep('l.contacts = (l.contacts||[]).map((c,i) => ({ name:', 'l.contacts = (l.contacts||[]).map((c,i) => ({ ...c, name:')
rep('boot();\n})();', 'window.VSAPP = { S, esc, toast, openDrawer, readDrawer, draftLead, renderContacts, refreshDrawerScore, scheduleSave, roleFor, putLead, guessMarket, marketOf, MK, MARKETS, leadsForShow };\nboot();\n})();')
rep('    <div id="refBox"></div>\n  </section>',
    '    <h3 style="margin:28px 0 6px" id="venues">Venues and offers</h3>\n'
    '    <p class="lede">What you sell: your venues, their spaces and packages, and seasonal offers. Scout pitches from this list.</p>\n'
    '    <div class="sec" id="venueCard"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>Venues</h3><span class="chip" id="venueChip">Loading…</span></div><div id="venueCtl"></div></div>\n'
    '    <h3 style="margin:28px 0 6px" id="scout">Scout</h3>\n'
    '    <p class="lede">Your research assistant. It finds new prospects every night and files them for your reps to keep or reject.</p>\n'
    '    <div class="sec" id="scoutCard"><div class="row" style="justify-content:space-between;align-items:baseline"><h3>Scout settings</h3><span class="chip" id="scoutChip">Checking…</span></div><div id="scoutCtl"></div></div>\n'
    '    <h3 style="margin:28px 0 6px">Integrations</h3>\n'
    '    <p class="lede">Apps VenueScout works with. Owners and Managers connect them. Your team uses Gmail and Tripleseat, so those come first.</p>\n'
    '    <div class="cards">' + cards + '</div>\n'
    '    <div id="refBox"></div>\n  </section>')

rep('<section id="v-today"><div id="todayBox"></div></section>', '<section id="v-today"><div id="scoutToday"></div><div id="todayBox"></div></section>')
rep('      <div class="sec" id="dScore"></div>\n      <div id="tsBox"></div>\n', '      <div id="scoutBox"></div>\n      <div class="sec" id="dScore"></div>\n      <div id="tsBox"></div>\n')
head_end = src.index('</style>') + len('</style>')
head, body = src[:head_end], src[head_end:]
body = body.replace('<script>', '<script src="/vs-shim.js"></script>\n<script>', 1)
body = body[:body.rindex('</script>') + 9] + '\n<script src="/vs-apollo.js"></script>\n<script src="/vs-tripleseat.js"></script>\n<script src="/vs-claude.js"></script>\n<script src="/vs-scout.js"></script>\n<script src="/vs-venues.js"></script>' + body[body.rindex('</script>') + 9:]
out = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
       '<script>try{var t=localStorage.getItem("vs_theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>\n'
       + head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
dest = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'app.html'
dest.write_text(out)
print('wrote', dest, len(out))
