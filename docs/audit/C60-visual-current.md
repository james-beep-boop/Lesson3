# C60 visual consistency — current partial evidence

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. The repository's computed-style measurement
script `tests/style-snapshot/pages.spec.ts` passed **1/1** in the CI-equivalent Chromium image against
the marked Mailpit target. It visited the anonymous login page, eight authenticated surfaces (home,
lesson, Guide, Discuss, Messages, Manage, editor and Users), account menus on home and Manage, and
home/Manage at 390px. The dump records computed colour, border, typography, layout and geometry
properties for every element; it is retained privately rather than written to the checkout.

The exact runner hash is
`1c8d02981ccb6f35bf6f1e3b27dc030f06097eafe2309827583cee21a8be1f1b`; the raw log hash is
`de9f2724f1413a93c0d4f20c8d412ba8eb3f2b509b8c66eaf1065f437db48238`; the private JSON dump hash is
`730a6187e2a36ce5bdb4ea5adedcf4faf73a82a1866733653dfe12d02b038b2e`. A first direct-`npx` attempt
failed before test discovery because it omitted the repository's `tsx/esm` loader; the corrected run
used `NODE_OPTIONS=--no-deprecation --import=tsx/esm` and passed. No product source or test files
were changed.

This is a current measurement, not a before/after comparison. The `menu-states` and `dialogs`
measurements also passed **1/1**
each (10.6 seconds each): menu keyboard focus, badges, dropdown/error/button states, and synthetic/
real Help, Insert-link and mobile dialogs. Their runner hash is
`0f49c1548955eafa071d537ccd91376e3abe0c3832b0c192320e4ea5f9e7cf05`; the combined log hash is
`22c2e1772dd30f184aacea81814a11eea2666b05971f64fe27ea846393b9db20`; private result hashes are
`f9c479a6dcb952283323ec202c4cf30f5aff84e07f967ae64a645a08a15deb1c` and
`5a42665d5036ed600408826c9a9063a899861d7cec73e278432d976c6488a9a6`. No C60 finding is accepted from
this slice.

The full role/route/width matrix then passed **1/1** with 84 page entries: four roles (Teacher,
editing Teacher, Subject-grade administrator, Site Administrator), seven routes, and 360/768/1280px
viewports. The measured routes were home, Guide, Discuss, Messages, a lesson page, Compare, and
Manage/Admin. No entry had horizontal overflow (`scrollWidth > innerWidth` was zero), and no 5xx
response was captured. The 13 console errors were the expected 404s from the one-version Compare
fixture, where a second version is intentionally absent.

Across the matrix the dump counted 780 buttons in 28 style variants, 753 links in 25 variants, 84
`h1` elements in 10 variants, 159 inputs in seven variants, 48 selects in two variants, and 87
tables in 13 variants. These are measurements for future design consolidation, not a defect count;
there is no stored before/after snapshot for this release. Full screenshot-by-screenshot human review
and a deployed-edge comparison remain open. Matrix source hash:
`80b7d257c1d990e7c9e18aba9825d9e85ec494985368f854095e4104b1137de1`; runner hash:
`162dab1f5e2bfb3bb6bb0ded25c47f5607a161e4afc02fbe51f928f5d9b63638`; raw log hash:
`ae82941b16c108efaab28aa9d8e4d2bf17ddc31143d5d19df7ab7aef7aa24e1f`; result hash:
`1e5bce4c4267d3aabedf0b28fb843e107efd63b675c14d5fc410b120160fef3d`.
