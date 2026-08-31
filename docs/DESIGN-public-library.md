# Public discovery and deployment modes

**Status:** product direction agreed 2026-08-12; the deployment boundary and publication model
(slices 2 and 3) are on `main`, including the disabled-mode 404, visibility/slug fields and the narrow
Plan → current Official resolver. `/explore` is still a placeholder: the public read, artifact,
sharing and attribution slices (4–7) have not been built. This document separates the decisions already
made from the choices the build still owes. `SPEC.md` remains authoritative for the resulting
architecture and security rules.

⚑ **PREREQUISITE COMPLETE (#217): the Official-pointer lock.** Every public route below resolves
through a plan's current Official pointer, so the delete-side stale-read race had to close before the
public contract was built on top of it. `enforceOfficialNotDeletable` now locks the `lesson_plans` row
before reading the pointer, and `officialPointerLock.int.spec.ts` mutation-pins the wait. There is
deliberately no matching explicit promotion-side lock: `UPDATE lesson_plans` already takes that row's
write lock, and the attempted test for an added lock passed with it removed. `hooks/lessonPlan.ts`
records the asymmetry at the point someone might otherwise re-add it.

## Goal

Get high-quality lesson plans into the hands of as many teachers as possible. The public experience
must prove the value of the library before asking a teacher to register: show real curriculum content,
open a classroom-ready PDF, and make a useful lesson easy to pass to another teacher.

This product also runs on local servers at schools with no internet connection. Those installations
need the authenticated lesson service, not the public website, promotional content, search-engine
surface, or internet-sharing features. Public discovery is therefore an optional deployment mode,
not the new shell around every installation.

## Decided experience

### The entry page stays restrained

`/login` remains the ordinary unauthenticated front door. On an internet deployment with public
discovery enabled it gains one secondary action: **Explore free lesson plans**. That action opens the
richer public library at `/explore`; it does not replace or crowd the sign-in form.

A shared public lesson URL is the exception: it opens that lesson directly. Sending a teacher a link
and then making them pass through the login page would break the distribution loop.

```text
Internet deployment
/login
  ├─ Sign in ───────────────────────→ authenticated library
  └─ Explore free lesson plans ─────→ /explore
                                      └─ public lesson → online preview / PDF / share

Offline school deployment
/login
  └─ Sign in ───────────────────────→ authenticated local library
```

### Public discovery is mobile-first

The public library must work well on laptops, but phones are the primary design constraint. At a
360–390 px viewport it must use a compact hero, a one-column lesson list, 44 px minimum touch targets,
search near the top, touch-friendly subject/grade filters, and no hover-only behavior. A lightweight
online preview comes before an optional large PDF; native device sharing is preferred, with explicit
WhatsApp and Copy link fallbacks. On laptops the same hierarchy can expand to a document preview and
multi-column featured lessons without becoming a different product.

### The lesson is the proof and the sharing unit

The public page leads with real lesson content, not a generic illustration. A public lesson page has
a stable, human-readable URL, curriculum context, an Official trust marker, a generator-derived online
preview, a PDF action, related lessons, and a **Share with a teacher** action. Its Open Graph metadata
must make a WhatsApp/social preview identify the subject, grade, title, ARES, and that it is a free CBE
lesson plan.

### Offline mode is a real boundary

Public discovery is controlled by an explicit opt-in deployment setting, **`PUBLIC_LIBRARY_ENABLED=1`**
(name settled 2026-08-14). It is not inferred from `SERVER_URL`: that variable already owns security
posture and must not silently acquire an unrelated product meaning.

⚑ **`PUBLIC_LIBRARY_ENABLED` set without `SERVER_URL` REFUSES TO BOOT** (decided 2026-08-14). Public
discovery needs an absolute base URL for Open Graph tags, share links and the printed document footer.
Without one they render relative, or omit the host entirely, on precisely the surface designed to
travel — a shared link that does not resolve, or a printed page whose URL a teacher cannot type in.
That is a misconfiguration an operator should hear about at boot, in the same fail-loud shape as
`firstUserBootRefusal` (`lib/publicPosture.ts`), not discover from a WhatsApp preview weeks later.
The two remain independent switches: `SERVER_URL` without `PUBLIC_LIBRARY_ENABLED` is the ordinary
authenticated internet deployment and boots normally.

When the setting is off:

- `/login` has no Explore action;
- public browse, public lesson, public metadata and public artifact routes return 404;
- no promotional, search-engine, analytics, WhatsApp or other public/internet UI is rendered;
- the existing authenticated library, generation, PDF/DOCX, editing and messaging behavior remains.

Hiding the button is not the security boundary. Every public route and artifact handler must enforce
the deployment setting server-side.

## Public-content boundary

Do **not** make `lesson-plans` or `lesson-bundle-versions` generally anonymous-readable. The versions
collection contains retained non-Official working copies, and Official is currently a trust/default
marker rather than an authenticated permission boundary.

The public path must resolve through a deliberately public Lesson Plan and then through that plan's
current Official pointer. Anonymous callers must never select an arbitrary version id. Narrow public
pages/endpoints may make trusted system reads only after proving all of:

1. public discovery is enabled for this deployment;
2. the Lesson Plan is deliberately public;
3. the requested slug identifies that plan;
4. the served version is the plan's current Official version.

The native fields are a visibility (`private | unlisted | listed`, defaulting to `private`) and a
unique public slug on `lesson-plans`. Whatever the field names, public visibility and Official status
remain separate concepts: approval does not silently publish content, and publication cannot expose a
non-Official version.

⚑ **A public slug is IMMUTABLE once the plan has first been published** — editable while the plan is
`private`, frozen the moment visibility becomes `unlisted` or `listed` (decided 2026-08-14). The whole
point of the feature is a link a teacher forwards to another teacher, so a slug that can change is a
distribution loop that silently breaks. Freezing it makes permanence structural and needs no retained
old-slug table or redirect resolution. The accepted cost is that a typo in a slug is only fixable by
unpublishing the plan first, which is the rarer event and a deliberate administrative act.

## Artifact behavior

The public experience offers a generator-derived online preview and PDF without requiring an
account. **PDF is the only anonymous download format. Word/DOCX always requires an authenticated
account because it gives the teacher an editable artifact.** The public UI must not show a Word
action, but hiding it is not the access boundary: the public artifact handler must reject DOCX
server-side. Favorites, editing, internal messaging and version history also remain authenticated.

The exact initial corpus may be a curated set rather than every Official plan. That scope remains
open until ARES confirms publication rights, attribution/licensing language, and which plans are
ready; the PDF-versus-Word account boundary does not.

Anonymous traffic must not become an unbounded document-generation surface. Public PDFs should be
served only from pre-warmed Official-version artifacts; a cold public request must not directly fan
out arbitrary Gotenberg work. Define the cold/missing behavior and public rate limits before opening
the route.

## Document attribution

Every newly generated deliverable—Lesson Sequence, Final Explanation and Summary Table, in both DOCX
and derived PDF—should carry a visible website reference and creator credit. A small footer on every
page is preferred over an end-only credit because pages are printed, photographed and forwarded on
their own. The visible URL must remain useful on paper; it may also be a hyperlink in the DOCX/PDF.

Working copy only, pending confirmation of the legal relationship and final public domain:

> Created by ARES Education in partnership with Seavuria · Free CBE lesson plans:
> kenyalessons.org · Page X of Y

This is one generator change, not content stored on each version and not a PDF-only overlay. Make it
upstream in the ARES generator, re-vendor the pristine files, run the fidelity gates, and increment
`GENERATOR_RENDER_VERSION` so old cached DOCX/PDF/HTML output cannot survive the change.

## Proposed implementation slices

1. **Rights and copy:** confirm publishable corpus, content licence/attribution, the ARES–Seavuria wording,
   and the permanent public domain.
2. ✅ **Deployment boundary:** explicit setting, login-page Explore action, 404 behavior when disabled,
   and tests proving the two modes. The environment ceiling is live; Manage's runtime
   `publicLibraryLive` control remains System-panel part 2.
3. ✅ **Publication model:** native fields, migration/codegen, Site-Admin controls, unique slug rules,
   and server-side Official/public resolution.
4. **Public read slice:** mobile-first `/explore`, human-readable lesson pages, generator-derived
   preview, metadata/social cards, related lessons and no authenticated controls leaking through.
5. **Public artifact slice:** pre-warm/serve-only PDF path, server-side tests proving anonymous DOCX
   is rejected, rate limits, cache/cold behavior and load testing on the Rock.
6. **Sharing and measurement:** native share/WhatsApp/copy, privacy-conscious funnel events if wanted,
   sitemap/SEO, and shared-link verification on real phones.
7. **Attribution footer:** upstream generator change, cache-version bump, DOCX/PDF visual QA and
   pagination/fidelity approval.

## Questions deliberately left open

- Which ARES plans may be public at launch, and under what licence?
- Is the credit “ARES Education in partnership with Seavuria,” “created by ARES and Seavuria,” or
  another legally accurate relationship?
- Is `kenyalessons.org` the permanent printed URL?
- Does public launch expose a curated sample, all explicitly listed plans, or eventually all Official
  plans after an independent publish action?
- Are analytics wanted at all? Offline installations must not load them, and the public site should
  measure only the useful funnel (preview → PDF → share → shared-link visit), not surveillance.
