"""Builds static mockups of the Lessons home page and sign-in page using the app's real CSS (app.css)."""
import pathlib

OUT = pathlib.Path(__file__).parent
SCHOOL = "Mwangaza Secondary School"
USER = "Achieng Odhiambo"

MOCK_CSS = """
/* ---- Mockup-only additions. Every value is an existing token; no new colours or fonts. ---- */
.home-greeting { font-size: var(--app-page-title-size); font-weight: 700; margin: 0 0 .25rem; }
.home-sub { color: var(--muted); margin: 0 0 var(--app-space-4); }
.home-section { margin: 0 0 var(--app-space-5); }
.home-section > h2 { font-size: var(--app-section-title-size); font-weight: 600; margin: 0 0 .75rem; }
.home-section__head { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; }
.home-section__head h2 { font-size: var(--app-section-title-size); font-weight: 600; margin: 0 0 .75rem; }
.home-section__head a { font-size: var(--app-secondary-size); }
.resume-why { color: var(--muted); font-size: .85rem; white-space: nowrap; }
.resume-row .substrand-main { align-items: center; }
.home-hint { color: var(--muted); font-size: var(--app-secondary-size); margin: .5rem 0 0; }
.shortcut-row { display:flex; flex-wrap:wrap; gap: .5rem; }
.home-cols { display:grid; grid-template-columns: 3fr 2fr; gap: var(--app-space-5); }
.sg-cards { display:grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; list-style:none; margin:0; padding:0; }
.sg-card { display:block; border:1px solid var(--line); border-radius: var(--radius); padding: .85rem 1rem; text-decoration:none; color: var(--ink); background: var(--bg); }
.sg-card:hover { border-color: var(--accent); }
.sg-card__name { display:block; font-weight:600; color: var(--accent); }
.sg-card__meta { display:block; color: var(--muted); font-size: var(--app-secondary-size); margin-top:.15rem; }
.sg-card__mine { display:block; color: var(--muted); font-size: .8rem; margin-top:.35rem; }
.login-welcome { text-align:center; color: var(--ink); margin: 0 0 1.5rem; }
.empty-box { border: 1px dashed var(--line); border-radius: var(--radius); padding: 1rem 1.1rem; color: var(--muted); font-size: .9rem; }
.mock-label { position: fixed; right: 12px; bottom: 12px; background: #1a1a1a; color:#fff; font: 12px/1.3 system-ui; padding: 4px 8px; border-radius: 4px; opacity:.85 }
@media (max-width: 640px) {
  .home-cols { grid-template-columns: 1fr; gap: var(--app-space-4); }
  .sg-cards { grid-template-columns: 1fr 1fr; }
  .resume-why { white-space: normal; }
}
"""


def page(title, body, label, signed_in=True):
    header = ""
    if signed_in:
        header = f"""<header class="app-header"><a href="#" class="brand">ARES Lesson Plans</a>
<nav class="app-nav" aria-label="Primary"><a class="app-nav__link" href="#">Lessons</a><a class="app-nav__link" href="#">Discuss</a>
<a class="app-nav__link" href="#">Manage</a><a class="app-nav__link" href="#">Guide</a>
<div class="user-menu"><button class="user-menu__avatar" type="button">AO</button></div></nav></header>"""
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title><link rel="stylesheet" href="app.css"><style>{MOCK_CSS}</style></head><body>
{header}<main class="app-main">{body}</main></body></html>"""


def row(num, name, count, context=None, fav=False, why=None, action=None, docs=True):
    ctx = f'<span class="substrand-context">{context}</span>' if context else ""
    star = "★" if fav else "☆"
    favcls = " is-favorite" if fav else ""
    right = ""
    if why:
        right += f'<span class="resume-why">{why}</span>'
    if action:
        right += f'<a class="btn btn--quiet btn--compact" href="#">{action}</a>'
    elif docs:
        right += (f'<span class="substrand-count">{count} lessons</span>'
                  f'<button class="fav-toggle{favcls}" type="button">{star}</button>'
                  '<span class="doc-buttons"><button class="btn btn--quiet btn--compact">PDF</button>'
                  '<button class="btn btn--quiet btn--compact doc-buttons__word">Word</button></span>')
    numhtml = f'<span class="substrand-num">{num}</span>' if num else ""
    return (f'<li class="substrand-row{" resume-row" if why else ""}"><div class="substrand-main">'
            f'<a href="#" class="substrand-link">{numhtml}<span class="substrand-name">{name}{ctx}</span></a>'
            f'{right}</div></li>')


SEARCH = '<form class="lp-search" role="search"><input type="search" placeholder="Search lesson plans"></form>'
FILTERS = """<div class="filter-bar"><div class="filter-group"><span>Grades:</span>
<label class="filter-grade"><input type="checkbox" checked> All</label><label class="filter-grade"><input type="checkbox"> 10</label>
<label class="filter-grade"><input type="checkbox"> 11</label><label class="filter-grade"><input type="checkbox"> 12</label></div>
<label class="filter-group">Subjects: <select><option>All</option></select></label></div>"""

FAVS = f"""<div class="sg-section fav-section"><h2 class="sg-head">My favorites</h2><ul class="substrand-list">
{row('1.4', 'Cell Structure', 6, 'Biology · Grade 10 · Strand 1.0: Cell Biology', fav=True)}
{row('2.1', 'Chemical Bonding', 5, 'Chemistry · Grade 10 · Strand 2.0: Structure of Matter', fav=True)}
</ul></div>"""

CATALOGUE = f"""<div class="sg-section"><h2 class="sg-head">Biology · Grade 10</h2>
<div class="strand-section"><h3 class="strand-head">Strand 1.0: Cell Biology</h3><ul class="substrand-list">
{row('1.1', 'Introduction to Biology', 4)}{row('1.2', 'The Microscope', 5)}{row('1.3', 'Cell Theory', 4)}{row('1.4', 'Cell Structure', 6, fav=True)}
</ul></div><div class="strand-section"><h3 class="strand-head">Strand 2.0: Anatomy and Physiology</h3><ul class="substrand-list">
{row('2.1', 'Nutrition in Plants', 6)}{row('2.2', 'Nutrition in Animals', 7)}</ul></div></div>
<div class="sg-section"><h2 class="sg-head">Chemistry · Grade 10</h2><div class="strand-section"><h3 class="strand-head">Strand 1.0: Introduction to Chemistry</h3><ul class="substrand-list">
{row('1.1', 'Laboratory Safety', 3)}{row('1.2', 'Separation of Mixtures', 5)}</ul></div></div>"""

RESUME_ROWS = (
    row(None, 'Cell Structure', 6, 'Biology · Grade 10 · Your draft', why='Saved 2 hours ago', action='Continue editing')
    + row(None, 'Nutrition in Plants', 6, 'Biology · Grade 10', why='Opened yesterday', action='Open')
    + row(None, 'Chemical Bonding', 5, 'Chemistry · Grade 10', why='Opened on Monday', action='Open')
)

# ---------- Current (baseline) ----------
current = f'<h1 class="lp-title">Lesson Plans</h1><p class="school-name">{SCHOOL}</p>{SEARCH}{FILTERS}{FAVS}{CATALOGUE}'

# ---------- Option A: one panel above today's page ----------
optA = f"""<h1 class="lp-title">Lesson Plans</h1><p class="school-name">{SCHOOL}</p>
<section class="home-section"><h2>Pick up where you left off</h2><ul class="substrand-list">{RESUME_ROWS}</ul></section>
{SEARCH}{FILTERS}{FAVS}{CATALOGUE}"""

# ---------- Option B: a home page with a welcome, two columns, then the catalogue ----------
optB = f"""<h1 class="home-greeting">Welcome back, Achieng</h1><p class="home-sub">{SCHOOL} · ARES Lesson Plans</p>
{SEARCH}
<div class="home-cols">
<section class="home-section"><h2>Pick up where you left off</h2><ul class="substrand-list">{RESUME_ROWS}</ul></section>
<section class="home-section"><h2>Your subjects</h2><div class="shortcut-row">
<a class="btn" href="#">Biology · Grade 10</a><a class="btn" href="#">Biology · Grade 11</a><a class="btn" href="#">Chemistry · Grade 10</a></div>
<p class="home-hint">From your favorites and the lessons you open. <a href="#">All subjects</a></p>
<h2 style="margin-top:1.75rem">Recently updated</h2><ul class="substrand-list">
{row(None, 'Gaseous Exchange', 6, 'Biology · Grade 11 · New official version, 3 Nov', docs=False)}
{row(None, 'Mole Concept', 5, 'Chemistry · Grade 10 · New official version, 28 Oct', docs=False)}</ul></section>
</div>
<div class="home-section__head"><h2>All lesson plans</h2></div>{FILTERS}{FAVS}{CATALOGUE}"""

optB_empty = f"""<h1 class="home-greeting">Welcome, Wafula</h1><p class="home-sub">{SCHOOL} · ARES Lesson Plans</p>
{SEARCH}
<div class="home-cols">
<section class="home-section"><h2>Pick up where you left off</h2><div class="empty-box">Lesson plans you open or edit will appear here, so you can get back to them in one click.</div></section>
<section class="home-section"><h2>Your subjects</h2><div class="empty-box">Choose a subject below, or star a lesson plan with ☆, and your subjects will appear here.</div>
<h2 style="margin-top:1.75rem">Recently updated</h2><ul class="substrand-list">
{row(None, 'Gaseous Exchange', 6, 'Biology · Grade 11 · New official version, 3 Nov', docs=False)}
{row(None, 'Mole Concept', 5, 'Chemistry · Grade 10 · New official version, 28 Oct', docs=False)}</ul></section>
</div>
<div class="home-section__head"><h2>All lesson plans</h2></div>{FILTERS}{CATALOGUE}"""

# ---------- Option C: subjects first; the catalogue opens one subject-grade at a time ----------
def card(name, meta, mine=None):
    m = f'<span class="sg-card__mine">{mine}</span>' if mine else ""
    return f'<li><a class="sg-card" href="#"><span class="sg-card__name">{name}</span><span class="sg-card__meta">{meta}</span>{m}</a></li>'

optC = f"""<h1 class="lp-title">Lesson Plans</h1><p class="school-name">{SCHOOL}</p>
{SEARCH}
<section class="home-section"><div class="home-section__head"><h2>Pick up where you left off</h2><a href="#">See all</a></div><ul class="substrand-list">{RESUME_ROWS}</ul></section>
<section class="home-section"><h2>Choose a subject and grade</h2><ul class="sg-cards">
{card('Biology · Grade 10', '24 lesson plans · 6 strands', '2 favorites')}
{card('Biology · Grade 11', '22 lesson plans · 5 strands')}
{card('Biology · Grade 12', '19 lesson plans · 5 strands')}
{card('Chemistry · Grade 10', '21 lesson plans · 5 strands', '1 favorite')}
{card('Chemistry · Grade 11', '20 lesson plans · 5 strands')}
{card('Physics · Grade 10', '23 lesson plans · 6 strands')}
</ul></section>
<p class="muted">Favorites: <a href="#">My favorites (3)</a></p>"""

LOGIN_FORM = """<form class="login-form"><label>Email<input type="email"></label><label>Password<input type="password"></label>
<button class="btn btn--primary" type="button">Sign in</button></form>
<p class="login-links"><a href="#">Sign up</a><a href="#">Forgot password?</a></p>"""
CREDIT = '<p class="login-subtitle">By <a href="#">ARES Education</a> and <a href="#">Seavuria</a></p>'

login_current = f"""<section class="login"><h1 class="school-name school-name--heading">{SCHOOL}</h1><p class="login-title">ARES Lesson Plans</p>
<p class="login-subtitle login-tagline">Find, edit and print lesson plans.</p>{CREDIT}{LOGIN_FORM}</section>"""

login_new = f"""<section class="login"><h1 class="school-name school-name--heading">{SCHOOL}</h1><p class="login-title">ARES Lesson Plans</p>
<p class="login-subtitle login-tagline">Find, edit and print lesson plans.</p>{CREDIT}
<p class="login-welcome">Welcome. Sign in to find this term's lesson plans, ready to print or download.</p>
{LOGIN_FORM}<p class="login-note" style="font-size:.85rem">New teacher? Choose Sign up, and your administrator will approve your account.</p></section>"""

pages = {
    "0-current-home": (current, "Today"),
    "A-home": (optA, "Option A: one panel above today's page"),
    "B-home": (optB, "Option B: a home page, then the catalogue"),
    "B-home-new-teacher": (optB_empty, "Option B: a new teacher's first visit"),
    "C-home": (optC, "Option C: subjects first"),
}
for name, (body, label) in pages.items():
    (OUT / f"{name}.html").write_text(page("Lesson Plans", body, label))
(OUT / "login-current.html").write_text(page("Sign in", login_current, "Sign-in today", signed_in=False))
(OUT / "login-proposed.html").write_text(page("Sign in", login_new, "Sign-in, proposed", signed_in=False))
print("ok")
