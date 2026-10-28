# Local mobile Lighthouse — C62/C61 supplement

Lighthouse12.8.2 attached to a fresh persistent Chromium profile, with a real editing-access teacher session. All five final paths matched the requested pages; no sign-in redirect was silently scored. Mobile360px, simulated throttling, bounded per-page waits; runner capped2 CPUs/4GiB.

Performance scores: home/catalogue100, lesson100, editor view93, discussions100, Guide100. Home and catalogue are the same route in this app. This uses a tiny fixture and an already running local stack; it does not establish large-school or production performance. The editor view was about658kB and had about180ms measured blocking time. Other metrics are in `lighthouse-results.json`.

The accessibility category scored100 for all five pages, but that does not mean no accessibility concerns. Unweighted experimental diagnostics reported account-avatar label text and HTML-preview table headers/captions. They remain leads requiring semantic review. The earlier axe crawl used only its named tags; it must not be called a complete WCAG audit. The local HTTP target also explains HTTPS/HTTP2 diagnostics; production TLS/CDN behaviour was not exercised.
