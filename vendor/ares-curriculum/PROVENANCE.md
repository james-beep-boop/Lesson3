# Reference only: ARES curriculum compiler (do not run, do not import)

Source: https://github.com/markknit/cbe-generation-system `main` at `d201e611`, `scripts/curriculum/compiler.py` (MIT, `LICENSE`).

Lesson3 does not run Python. This copy is here so issue #515 can port the layouts of `write_guide` (Compact Teacher Guide) and `write_student_summary` (Student Summary Table), and the helpers they call (`attribution_footer`, `write_doc` patterns), to Node with the `docx` package. The data comes from Lesson3's stored bundle: `build()` shows how upstream's `module` maps to the R1 contract fields (`META`, `UNIT`, `LESSONS`, `SUMMARY_TABLE`).

`samples/`: upstream's own PDFs of both documents for General Science 2.4 (`data/codex_pilot_2026-11/outputs/PDF/`), as the visual target.

```
cf8b6f489a5c85b3870b2eafdc199d68bbfadde42433a7f6bad64421bc37a691  compiler.py
9c531a2a5774730eb2eea7fdaf5f4f36c7ae5bf31d5088b269c92f0f145193a5  LICENSE
dc1503f188f943307b235dc11d85d14f5a1ff71fac8278d16eaa24e348e1eaa2  samples/Codex_General_Science_Acids_Bases_and_Salts_CompactTeacherGuide.pdf
ea11c9d2817d959f1657e0f17c2fb14252ba7e5aa34c977370ce3808f5b553a5  samples/Codex_General_Science_Acids_Bases_and_Salts_StudentSummaryTable.pdf
```
