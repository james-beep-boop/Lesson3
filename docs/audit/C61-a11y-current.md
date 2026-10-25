# C61 accessibility — current partial evidence

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`. A pinned Chromium probe injected the installed
`axe-core` 4.12 rules and checked seven representative pages: anonymous login; Site Administrator
home, Manage, Messages and Discuss; Teacher home; and Teacher Manage. All seven completed with **zero
axe violations**. The probe also exercised the real role login and fixture teardown against the marked
target.

Three pages (Site Administrator home, Teacher home and Teacher Manage) returned one `color-contrast`
check in axe's `incomplete` set. Each incomplete node was the aria-hidden `☆` favorite glyph and
reported `messageKey=nonBmp`; axe could not determine the contrast of that non-BMP character. This is
an explicit manual-review lead, not a confirmed defect or accepted finding. The other four pages had
no incomplete checks.

The private probe source hash is
`a1ef20e13fb2dc9550a86ebe4f38f7f1e228a42388f18251d98d584d2732f47e`; runner hash is
`a6fbeeb7692765207a06c719a9deb034e6007dd9cdd78a80a0f90b591b900f6b`; raw log hash is
`08a07cf2828035f56ca844c13fd98332a1265d1e70c9cd9e007378ed42770ef9`; result JSON hash is
`28bfaadb46a5801baa6e8057a259c0e93d2a752705e3b05ef379797656e89b7d`. No product files changed.

The complete route/role axe matrix, keyboard-only walkthroughs, focus visibility, contrast review of
the favorite glyph, and screen-reader checks for icon controls remain open.

The complete Chromium role/route matrix subsequently checked **28 pages** (four roles × seven
routes: home, Guide, Discuss, Messages, lesson, Compare, and Admin/Manage). Every page completed
with **zero axe violations** and the run exited 0. Nine checks were `incomplete`, all color-contrast
determinations that axe could not resolve: the aria-hidden non-BMP favorite star appeared on every
role's home page and on lesson pages, and generated lesson document text/link nodes appeared on
lesson pages. These are tool limitations/manual-review leads, not violations. Teacher Admin redirects
to home and therefore has the home-page star lead; the other role Admin pages had no extra incomplete
result.

The full-matrix probe source hash is
`05190f3bb6b5255c60bd73101d9da02915e96ad331b5dbae97f670418c34db32`; runner hash is
`e6ebe84dc2cf921d7253c3769001fe3697657e89ad6f229237c2689212ef8061`; raw log hash is
`ecf1c3c49285a9b90c79a316b1670898ef3b30ad3dcd70b60071116e420abc74`; result hash is
`208ebc8175b2ac6ce599b9006af6821e1ab23f4627ecddf06a0152fe20cf3439`.

Keyboard-only completion, manual contrast sampling of the non-BMP glyph, and screen-reader output
remain qualified follow-ups. No C61 finding is accepted.
