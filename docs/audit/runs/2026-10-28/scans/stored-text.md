# Stored-text browser sample — C24/C41

Native authorized requests stored an img/onerror payload in a user's name, discussion title/opening body/reply, private message and lesson prose. Both Chromium and WebKit then visited six surfaces: discussion list/thread, recipient inbox, selected candidate lesson, native editing form and actual generated HTML preview. Assertions require the submitted text/value to be present in the relevant content, no active payload onerror element and no executed window marker. Both engine runs passed. The thread assertions separately cover opening body, reply body and the author's name. The lesson and preview use the real generator/Mammoth/sanitizer seam.

Initial fixture submission omitted the required joinedAtSeq precondition on the reply and received400; that run reached no browser assertions and earns no coverage. The corrected native request supplies0 for the newly created thread, matching the actual client contract.

Limits: one named payload family and small synthetic content, six sampled surfaces. This is not proof of all HTML/URL/CSS/Unicode payloads, every user-text field, emails, Office viewers or all stored-XSS paths. parse-never-execute/ZIP corpus and URL-policy tests remain separate evidence. No external mail was sent.
