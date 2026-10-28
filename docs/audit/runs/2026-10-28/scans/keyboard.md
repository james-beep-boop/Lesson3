# Keyboard and visual sampling — C60/C61 (partial)

Chromium's audit journey passed using Tab, Enter and keyboard text entry: sign in, dismiss Welcome, search, open a lesson, enter editing, change prose, save a new version, return to the lesson, download Word, receive a PDF200 and post a discussion. A trusted database read confirms the saved prose. No pointer clicks or direct field-focus shortcuts are used in the journey. One initial test selector said “New discussion”; the actual label is “Start a discussion”. Correcting that harness selector produced the pass.

WebKit's corresponding journey currently fails to reach the search field by Tab after dismissing Welcome. The field remains visible; focus remains on body. Separate minimal native controls tab correctly in both engines, including after removing a focused dismiss button. The application or browser-integration cause is unresolved; no full WebKit keyboard success is claimed. Automated axe checks alone did not find this symptom.

Manual screenshot sample selection: cover a narrow teacher lesson, a tablet Guide and desktop administration across both browser families. The coordinator opened Chromium360px teacher lesson, Chromium768px Guide and WebKit1280px Site Administrator Manage images. Text/action layout was legible in these samples; long synthetic headings wrapped. The lesson's wide preview tables need their contained horizontal scrolling on a phone. This is three sampled states, not visual inspection of every crawl screenshot or every expanded panel.

The local build footer says “Version unavailable” because this audit image was built without a release tag; that is an environment condition, not evidence the published release is missing its version.
