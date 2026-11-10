# Gotenberg (DOCX→PDF sidecar) + Microsoft core fonts.
#
# Why this is a local build rather than the pinned upstream image (docker-compose.yml `gotenberg`):
# ARES-generated DOCX call for **Arial** on every run. Stock Gotenberg's LibreOffice has no Arial and
# substitutes Liberation Sans, whose vertical metrics differ enough to shift table ROW HEIGHTS versus
# Word — a visible fidelity gap in the exported PDF (SPEC §9). Installing the real Microsoft fonts
# makes the export render the exact typeface the document specifies; verified on the Rock that this
# closes the visible table-height gap (three-way Liberation/Arial/Word render comparison).
#
# `ttf-mscorefonts-installer` (Debian `contrib`) downloads the fonts after accepting Microsoft's EULA
# non-interactively in a build-only stage. We deliberately do not vendor the font files in the repo;
# redistribution rights remain a separate legal question. Build needs outbound network (SourceForge)
# once per image build. The final image contains only the unchanged font files, not the installer,
# wget or cabextract.
#
# Supply-chain pinning (Codex 2026-07-05 #8): the base image is pinned by its multi-arch INDEX
# digest (covers amd64 for CI and arm64 for the Rock/Macs) and the font installer package by exact
# version, so `docker build` cannot silently pick up a different upstream. Both pins fail LOUDLY
# when upstream moves (Debian archives drop superseded package versions) — that build error is the
# deliberate re-pin moment, not a bug. To re-pin:
#   docker buildx imagetools inspect gotenberg/gotenberg:9.3.0-libreoffice → index digest
#   apt-cache policy ttf-mscorefonts-installer (in the new base, contrib enabled) → new version
# Resolved 2026-11-10: digest = Gotenberg 9.3.0 LibreOffice-only; installer 3.8.1. The font binaries
# themselves are Microsoft's frozen cab files — the installer verifies their checksums.
FROM gotenberg/gotenberg:9.3.0-libreoffice@sha256:7b8061d5b45416a6d2ccb1506745d8cc15ab95aaa2b993a34a1e4f97aaf35042 AS fonts

USER root
RUN set -eux; \
    # Enable the `contrib` component on the base image's deb822 source (reusing its signing key,
    # so we don't conflict on Signed-By), then install the font package non-interactively.
    sed -i '/^Components:/ s/$/ contrib/' /etc/apt/sources.list.d/debian.sources; \
    echo 'ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true' | debconf-set-selections; \
    apt-get update; \
    # RETRY the font install (2026-07-27). `ttf-mscorefonts-installer`'s post-install step downloads the
    # cab files from an EXTERNAL mirror, and that fetch is intermittently unavailable: it failed twice in
    # one afternoon with `dpkg` exit 100, aborting a whole `compose up --build` and blocking an app-only
    # deploy. deploy.sh now skips this build when the sidecar is unchanged, but that only routes AROUND
    # the flakiness — CI (`up -d --build` on a cache-less runner), a genuine gotenberg/ change, and
    # FORCE_SIDECAR_BUILD recovery all still depend on this step succeeding. Backoff: 15s/30s/45s/60s.
    for i in 1 2 3 4 5; do \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ttf-mscorefonts-installer=3.8.1 wget cabextract fontconfig && break; \
      if [ "$i" = 5 ]; then echo "font install failed after 5 attempts" >&2; exit 1; fi; \
      echo "font install attempt $i failed; retrying in $((i*15))s" >&2; sleep $((i*15)); \
    done; \
    # POSTCONDITION, not just an exit code: a retry loop can otherwise mask a package that unpacked but
    # never configured, and DOCX fidelity depends on real Arial actually being present (stock Gotenberg
    # substitutes Liberation Sans and shifts table row heights vs Word).
    dpkg -s ttf-mscorefonts-installer | grep -q '^Status: install ok installed'; \
    fc-cache -f; \
    fc-list | grep -qi arial

# Lesson3 never calls Chromium. Starting from the LibreOffice-only image removes that browser and its
# dependency tree rather than merely making the routes unreachable. The build tools stay behind in the
# `fonts` stage; copying the downloaded, unmodified fonts preserves the existing build-on-the-box policy.
FROM gotenberg/gotenberg:9.3.0-libreoffice@sha256:7b8061d5b45416a6d2ccb1506745d8cc15ab95aaa2b993a34a1e4f97aaf35042

USER root
COPY --from=fonts /usr/share/fonts/truetype/msttcorefonts/ /usr/share/fonts/truetype/msttcorefonts/
RUN set -eux; \
    fc-cache -f; \
    fc-match Arial | grep -q '^Arial.ttf:'; \
    if command -v wget >/dev/null 2>&1; then echo 'wget leaked into the runtime image' >&2; exit 1; fi; \
    if command -v cabextract >/dev/null 2>&1; then echo 'cabextract leaked into the runtime image' >&2; exit 1; fi; \
    if dpkg-query -s ttf-mscorefonts-installer >/dev/null 2>&1; then \
      echo 'ttf-mscorefonts-installer leaked into the runtime image' >&2; exit 1; \
    fi
USER gotenberg
