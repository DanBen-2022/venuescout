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
rep('${showOf(l)?" · show week: "+esc(showOf(l).name):""}</div>${l.example',
    '${showOf(l)?" · show week: "+esc(showOf(l).name):""}${l.owner&&window.VS?" · "+esc(window.VS.ownerName(l.owner)):""}</div>${l.example')
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
    ("Tripleseat", "Booking system", "next", "Mark a prospect Won with the real booked value when the event is confirmed in Tripleseat, and send new prospects to Tripleseat as leads.",
     "Needs API access from Tripleseat. Ask your Tripleseat account manager or support for API keys and webhooks."),
    ("Apollo, ZoomInfo or Cognism", "Contact data", "planned", "Fill in the decision maker and event coordinator with verified email and phone.", "Connects with an API key from your plan."),
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
rep('    <div id="refBox"></div>\n  </section>',
    '    <h3 style="margin:28px 0 6px">Integrations</h3>\n'
    '    <p class="lede">Apps VenueScout works with. Only Owners can connect them. Your team uses Gmail and Tripleseat, so those come first.</p>\n'
    '    <div class="cards">' + cards + '</div>\n'
    '    <div id="refBox"></div>\n  </section>')

head_end = src.index('</style>') + len('</style>')
head, body = src[:head_end], src[head_end:]
body = body.replace('<script>', '<script src="/vs-shim.js"></script>\n<script>', 1)
out = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
       + head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
dest = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'app.html'
dest.write_text(out)
print('wrote', dest, len(out))
