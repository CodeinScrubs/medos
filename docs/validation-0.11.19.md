# Validation scope: 0.11.19

Version 0.11.19 / Android code 35 repairs the authenticated native AES output
capacity boundary discovered during API 26 restore and enforces immutable null
owners for recording journals. No dependency, permission, schema, archive format,
writer or passphrase scheme changes. No new screen or feature.

## Reproduction

The 0.11.18 API 26 SAF restore and direct native JCA output-count probe are
documented in [validation-0.11.18.md](validation-0.11.18.md). Before implementation,
the localized authenticated-provider/format and migrated-SQLite witnesses ran
three suites: nine new cases failed, 82 cases passed. A real WebCrypto decrypt
authenticated before the test wrapper reproduced the observed extra capacity;
the global native stand-in was not weakened. The null-owner witness changed a
generic capture's patient during the async copy, reproduced mismatched journal/
attachment ownership, and is not a failure in the current enabled patient UI.

## Software and native gates

`npm run check` passed typecheck, lint, formatting, 101 suites / 1302 app tests
and all three workflow tests. An initial typecheck caught a test cleanup callback
returning Jest instead of void; it was corrected before the successful full gate.
Exact-source hosted CI, signed arm64/x86_64 package inspection, modern upgrade/
preservation and native API 26 old/current SAF restore remain pending at this
implementation stage. Acceptance evidence is added after running them.

Tests cover exact/extra-zero/invalid native output sizes, preserved real trailing
zeros, empty final chunks, independent AES interoperability, frozen key schemes,
auth failure with changed ciphertext/tag/key/AAD/nonce/index/last flag, unchanged
multi-chunk archives and the exact-boundary empty final chunk. Recording tests
cover canonical null ownership after source read, copy and ready publication,
refused reattachment, retained bytes and successful replay after context restoration.

## Still open

This is not complete backup, dataset, voice or physical-phone acceptance. Durable
raw note/quick-capture voice targets, active/pre-journal/source-cache interruption,
ordinary writes/old editors/photo work versus restore, raw manual forms,
original-before-crop, low-space/power behavior and broader clinical workflows
remain separate gates. See `IMPLEMENTATION.md` for delivery priorities.
