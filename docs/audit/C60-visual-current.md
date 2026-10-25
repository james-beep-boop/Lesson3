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
measurements, full role/route matrix at 360/768/1280px, screenshot review and accessibility checks
remain open. The follow-up `menu-states.spec.ts` and `dialogs.spec.ts` measurements also passed **1/1**
each (10.6 seconds each): menu keyboard focus, badges, dropdown/error/button states, and synthetic/
real Help, Insert-link and mobile dialogs. Their runner hash is
`0f49c1548955eafa071d537ccd91376e3abe0c3832b0c192320e4ea5f9e7cf05`; the combined log hash is
`22c2e1772dd30f184aacea81814a11eea2666b05971f64fe27ea846393b9db20`; private result hashes are
`f9c479a6dcb952283323ec202c4cf30f5aff84e07f967ae64a645a08a15deb1c` and
`5a42665d5036ed600408826c9a9063a899861d7cec73e278432d976c6488a9a6`. No C60 finding is accepted from
this slice.
