# Restoring the Care Companion source snapshot

This directory contains a source-only transfer snapshot of the reviewed Care Companion application. The repository root provides project documentation and production configuration; the complete application source is preserved in these Base64 files rather than as a browsable native source tree.

## Restore

Run from the repository root on macOS or Linux:

```bash
cat source-snapshot/part-00/chunk-*.txt \
  source-snapshot/care-companion-source.tar.xz.base64.part-01.txt \
  source-snapshot/care-companion-source.tar.xz.base64.part-02.txt \
  source-snapshot/care-companion-source.tar.xz.base64.part-03.txt \
  | base64 --decode > care-companion-source.tar.xz
```

The chunk filenames are zero-padded, so the wildcard restores them in the required order. On macOS, if `--decode` is not accepted, use `base64 -D` instead.

Verify the exact archive before extracting it:

```bash
printf '%s  %s\n' \
  '2a89ff6619d55bf25e48f5b9792bd1238b2771f09ad8443b96cb6adf07ea8a69' \
  'care-companion-source.tar.xz' | sha256sum --check
```

On macOS, use `shasum -a 256 care-companion-source.tar.xz` and compare the output with the same SHA-256 value.

Extract into a new empty directory and install dependencies:

```bash
mkdir care-companion-restored
tar -xJf care-companion-source.tar.xz -C care-companion-restored
cd care-companion-restored
npm install
```

Follow the application README and `docs/DEVELOPER_HANDOFF_PROMPT.md`. Supply your own environment values and platform services for authentication, database, object storage, and AI features.

## Snapshot scope

- Archive size: 115,500 bytes.
- Archive SHA-256: `2a89ff6619d55bf25e48f5b9792bd1238b2771f09ad8443b96cb6adf07ea8a69`.
- `package-lock.json` is intentionally omitted; `npm install` regenerates it. Review dependency changes before committing.
- The archive contains source files but no `.git` history.
- No credentials, real medical records, uploaded medical files, session tokens, or synthetic verification records are included.

## Transfer verification

The first Base64 part is stored as ten verified chunks under `part-00/`; parts 01–03 remain single files. The table lists Git blob SHA-1 values for the exact stored content without a trailing newline.

| File | Bytes | Git blob SHA-1 |
| --- | ---: | --- |
| `part-00/chunk-00.txt` | 4,003 | `b73e71d27dd20c0d496c1636824627566eb59a25` |
| `part-00/chunk-01.txt` | 4,003 | `dea854f90c3725f3e838050814c1742e1c6a5c37` |
| `part-00/chunk-02.txt` | 4,003 | `3cd4dac1da004db1b804841a62ab4261de329279` |
| `part-00/chunk-03.txt` | 4,003 | `939811d7f5f97eaeb805df744b268b240ba32567` |
| `part-00/chunk-04.txt` | 4,003 | `0c75cbce8efdba65f2aec44cb6507d549bb07377` |
| `part-00/chunk-05.txt` | 4,003 | `c9676249f0c453f961685e175a6f3eb5e61a71ba` |
| `part-00/chunk-06.txt` | 4,003 | `73c0c810344780d5d8ff3c6352da91daebc30ac0` |
| `part-00/chunk-07.txt` | 4,003 | `400522c17f0aa1bfa36e86c9f9ea02291911f81a` |
| `part-00/chunk-08.txt` | 4,003 | `4ba246f370208e47be010ae61bd75be9197bfad0` |
| `part-00/chunk-09.txt` | 3,002 | `5e325358c902ab0e26b16d40aca2f55793f6657b` |
| `care-companion-source.tar.xz.base64.part-01.txt` | 39,038 | `028ccaa875e66230f36cf5afa8ec5ce0faa69694` |
| `care-companion-source.tar.xz.base64.part-02.txt` | 39,038 | `2b41fad3ae92367a96fdb16c78b41a9d40402246` |
| `care-companion-source.tar.xz.base64.part-03.txt` | 37,036 | `31e688b3fbd1f859d9a6b36762c5b2d74b2d0a51` |

The complete sequence was decoded and compared byte-for-byte with the original archive before upload.
