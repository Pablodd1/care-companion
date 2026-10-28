# Care Companion development checkpoint 9c0b27b

This directory contains the complete source delta from the reviewed baseline snapshot in `source-snapshot/` to local commit `9c0b27b` (`Add care history, clinician review, and push reminders`). It adds effective-dated medication schedules, audited corrections, clinician review and printable summaries, Web Push subscription/delivery plumbing, and traceable USDA food records.

**Status:** development checkpoint, not a verified release. TypeScript checking passed. Database migration is not complete: `drizzle-kit push` stopped on an existing-table `Multiple primary key defined` mismatch. No table was truncated or dropped. Browser, production, scheduler, and physical-iPhone verification remain pending.

## Restore and upgrade

First restore the original baseline exactly as described in `source-snapshot/README.md`. From the restored application directory, decode and verify this upgrade:

```bash
cat /path/to/repository/source-snapshot/upgrade-9c0b27b/chunk-*.txt \
  | base64 --decode > /tmp/care-companion-9c0b27b.patch.xz

printf '%s  %s\n' \
  '0de695818ed3f1084ab483574cb77327d9d1184a155398e66c5a2f2d41a7cfb5' \
  '/tmp/care-companion-9c0b27b.patch.xz' | sha256sum --check

xz -dc /tmp/care-companion-9c0b27b.patch.xz > /tmp/care-companion-9c0b27b.patch
printf '%s  %s\n' \
  'd2d19f0583017269c1519b531c990c425e5a102c9222428bf06a56e9e5982be3' \
  '/tmp/care-companion-9c0b27b.patch' | sha256sum --check

git apply --check /tmp/care-companion-9c0b27b.patch
git apply /tmp/care-companion-9c0b27b.patch
npm install
npm run check
```

On macOS, use `base64 -D` if `--decode` is unavailable and `shasum -a 256` instead of `sha256sum`. Run `git apply` from the restored source root. A Git repository is not required for `git apply`.

`package-lock.json` is intentionally excluded from the patch because the baseline transfer omitted it. `npm install` regenerates it; review dependency changes before committing.

## Integrity

- Patch: 144,830 bytes; SHA-256 `d2d19f0583017269c1519b531c990c425e5a102c9222428bf06a56e9e5982be3`.
- Compressed patch: 28,572 bytes; SHA-256 `0de695818ed3f1084ab483574cb77327d9d1184a155398e66c5a2f2d41a7cfb5`.
- Base64 chunk sequence: `chunk-00.txt` through `chunk-04.txt`.
- No `.env`, credentials, real medical records, uploaded medical files, session tokens, dependencies, build outputs, or synthetic verification data are included.
