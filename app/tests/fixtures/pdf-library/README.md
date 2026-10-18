# PDF wire fixture

`public-wire.pdf` is an original, minimal one-page PDF with a valid cross-reference table.
The local Git attribute treats PDFs as binary so line-ending conversion cannot corrupt its offsets.
`docker-compose.test.yml` mounts this folder read-only and configures only the test app to serve it.
The wire test compares the complete streamed response with these exact bytes. No production
installation loads this override or enables this folder by default.
