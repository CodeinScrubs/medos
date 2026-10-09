# 0.11.47 — native Kardex ownership and preserved clinical context

Source: `b8f44a836cfe3776c09fd9bba5d7551a976bba1a`. Evidence collected
2026-10-09 by GPT-6 via Codex on the owned x86_64 emulator with synthetic data.
The subsequent .48 source changes are not in this installed APK.

## Source checks and artifact

Full local and normal pre-push checks pass156 suites/2,143 application tests
and five workflow checks, with typecheck/lint/both formatting checks green.
Exact-source [hosted CI passed](https://github.com/CodeinScrubs/medos/actions/runs/37902147670).

- Private QA APK:54,927,114 bytes, SHA256
  `f846d41812c7354ca61b752c27a1a849fdde09ed7e86267b8240a5245a23c851`.
- Actual package `com.shayan.medos`, version0.11.47/code63, minSDK24/target36.
- x86_64 and required JNI libraries pass inspection. Certificate SHA256:
  `1119f776e6e31fdea3f2b514dc564b430e67b85d11aab984b6b500c89be87e0c`.
- The frozen-source build completes in20m23s. In-place installation succeeds;
  the pulled installed base APK has identical bytes and hash.

The artifact stays private, outside `dist/`. Owner arm64 and physical-phone
acceptance are not established by this emulator build.

## Actual native actions

An independent fixture adds11 rows to the accepted base: two patients, three
encounters and six orders. These distinguish the current encounter, a closed
historical encounter, another patient and a standing order with unknown start.
The document picker and actual restore engine import it; completion and its
acknowledgment are observed before actions.

1. The current Kardex initially shows four current/standing orders, excluding
   the historical and foreign-patient orders.
2. A current active order is held, resumed and discontinued through actual
   card actions and the required confirmation. Fresh hierarchies show each
   state and the final discontinued order under the expandable stopped group.
3. Another current order is long-pressed and deleted through its confirmation;
   its card disappears. The independent archive confirms a tombstone, not
   removal of the row.
4. The standing unknown-start order is opened, its notes edited and Save tapped.
   The native editor returns with the same process, a visible MedOS page and
   no fatal entry for that process. Its stored start and encounter remain null.
5. Opening that order with the other patient's route shows Not found and no
   editable fields. Returning retains the same process with no fatal entry.

Bounds come from fresh UI hierarchies. An initial hold probe expected the
wrong Persian badge and did not account for the reordered card moving below
the fold; it is rejected. Fresh bounded scrolling then observes the actual
held badge and resume control. This is not evidence of a failed status write.
No clinical medication recommendation or real patient data is used.

## Independent archives and cold cleanup

Actual UI exports are decoded with a separate Node scrypt/AES-GCM reader.
Every application-row column and archived media hash is compared. Settings,
audit, backup-run and migration bookkeeping are excluded from the all-row
comparison; the four relevant order audit rows are checked separately for
expected action/entity, strict time ordering and null text/detail.

- .46→.47 in-place upgrade:4,117 rows/49 application tables/34 media files,
  exactly unchanged, SHA256
  `a74d47b1753e52bad7543e04165d71106c7e435b89d20165a91fe14291b2f231`.
- Independent11-row fixture input:
  `fa5087eafdea2c20f1ad6d460238a8bd1a216a634f1130207daa0e899c97ae7f`.
- Actual post-witness full archive:4,128 rows/49 tables/34 files,
  `ea9a768767d72c7b1c8e4347a224b5e227e7591100f2e0cd8b7979a33b3c5d63`.
  All columns match the oracle after exactly three intended order changes:
  terminal status/time, deletion/time and edited notes/time. Three status audits
  and one delete audit are present. All other original, historical and foreign
  rows and all media hashes remain unchanged.
- Actual base restore, acknowledged completion, force-stop/reopen and full
  UI export:
  `572c9184d09dfb01198ea3ddb7ba3bf3cba9b6110fc22cf1ec56b6de04a3ce9b`.
  All4,117 original rows and34 media hashes match the accepted .46 cold base;
  all11 fixture rows are removed.

All accepted archives report28 migrations, integrity OK and clean foreign keys.
The final crash-buffer read succeeds with zero MedOS fatal entries. This is
bounded observation, not crash freedom, full-shift performance or resolution
of the older pressure/boot ANR.

The order editor remains manual: raw/CAS recovery, original new-encounter
intent, full correction history and order-trash restore remain open. The other
manual forms, rich text, shift/follow-up completion, broad native acceptance
and physical-device gates remain in `IMPLEMENTATION.md`; only-phone-remaining
or product-complete claims would be incorrect.
