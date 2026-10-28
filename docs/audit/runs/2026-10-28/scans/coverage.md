# Coverage measurements — C10/C72

Pinned Vitest/V8 provider4.1.12 ran in a throwaway baseline copy, with its separate dependency installation; the application lockfile was unchanged. Unit run:1976 pass. Integration repeat against a newly created disposable test DB:355 pass. An earlier integration coverage run overlapped a case probe and is discarded.

The explicit-source unit run includes an unimported one-line negative control, which appeared with zero coverage. That verifies inclusion of an unimported file in this configuration, not coverage of every runtime surface. Excluding that private control, V8 reports 5636/8908 instrumentable lines (63.27%). Directory aggregates and zero-covered files are in coverage-summary.json. These are transformed/instrumentable lines, not physical source LOC. Generated/vendor/migration exclusions and the provider's handling of server components constrain the denominator. The default imported-only unit run has a different denominator; its70.57% is not directly comparable.

The serial integration report uses an imported-module denominator:2731/5137 lines,53.16%. Do not add it to unit coverage or present either as overall tested behavior. Existing HTTP, browser and script outcomes are separate evidence, not included in those line percentages.

Unit gaps include dashboard/deletion panels, server pages, user/menu/dialog composition and some native endpoint wiring. Integration/browser/wire tests exercise parts of those surfaces, so zero unit lines do not mean wholly untested. The newly reproduced expiry and omitted-UNIT defects show why passing baseline suites and high pure-helper coverage do not establish boundary completeness.
