# Gotenberg (DOCX→PDF sidecar) + Microsoft core fonts.
#
# Why this is a local build rather than the pinned upstream image (docker-compose.yml `gotenberg`):
# ARES-generated DOCX call for **Arial** on every run. Stock Gotenberg's LibreOffice has no Arial and
# substitutes Liberation Sans, whose vertical metrics differ enough to shift table ROW HEIGHTS versus
# Word — a visible fidelity gap in the exported PDF (SPEC §9). Installing the real Microsoft fonts
# makes the export render the exact typeface the document specifies; verified on the Rock that this
# closes the visible table-height gap (three-way Liberation/Arial/Word render comparison).
#
# `ttf-mscorefonts-installer` (Debian `contrib`) downloads the fonts under Microsoft's redistribution
# EULA (accepted non-interactively below) at build time — we deliberately do NOT vendor the .ttf
# files, which that EULA disallows. Build needs outbound network (SourceForge) once per image build.
FROM gotenberg/gotenberg:8

USER root
RUN set -eux; \
    # Enable the `contrib` component on the base image's deb822 source (reusing its signing key,
    # so we don't conflict on Signed-By), then install the font package non-interactively.
    sed -i '/^Components:/ s/$/ contrib/' /etc/apt/sources.list.d/debian.sources; \
    echo 'ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true' | debconf-set-selections; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ttf-mscorefonts-installer wget cabextract fontconfig; \
    fc-cache -f; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/*
USER gotenberg
