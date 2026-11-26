# MotionLog v15

Implemented from the supplied v15 change notes on 2026-11-25 (America/Los_Angeles). P0/P1 items each have a numbered commit. P2-8 is intentionally omitted because it was optional and required a separate choice.

The buildless app is split into `index.html`, `app.css`, `app.js`, account sync, and focused timer/metrics/photo/layout helpers. Existing localStorage keys, IndexedDB database, Supabase table/bucket, and backup envelope `app: MotionLog, version: 1` are retained. Account caches and a durable outbox isolate anonymous and authenticated use; anonymous data is imported into an account only with explicit confirmation. Personal training seeds are removed from runtime source.

## Verification

- `npm test`: 52 passed. Includes form validation, deletion/undo, unit/weight integrity, duration, backup structure/media validation, failed-save rollback, history pagination, trend aggregation, PR chronology, timer timestamps, PWA public-only caching, sync conflicts, in-flight edits, media retry, and account changes.
- Browser: local bodyweight save, delete/undo, invalid editor staying open, derived training-day total, and clean console observed.
- Browser geometry: dashboard/history/calendar all had equal scrollWidth/clientWidth at320,360,390,1440. Required mobile390×844 and desktop1440×900 included.
- GIF lazy-loading regression confirms no database fetch until picker use. 3D imports, resources, entrypoints, and migration seed payloads removed.
- A private pre-deploy backup and read-only account comparison verified57 action records,125 stored set entries, and1 manual check-in, with all backup records/checkins exactly preserved. These totals describe the verification snapshot, not sample defaults.

## Limits

The browser extension's file chooser did not complete the manual backup-import run; automated backup restore tests passed. Authenticated two-device live edits, physical-device offline recovery, actual 8MB photo encoding/upload, vibration/audio, and home-screen installation were not exercised end to end. Those components have focused simulated regression coverage. No synthetic workouts were written into the production account during verification.

## Build and rollback

Run `npm ci`, `npm test`, and `npm run build`. Deploy only `dist/`; it contains an explicit allowlist of11 runtime assets, not tests, source history, credentials, or private backups. Deploy the existing site's selected source commit. The previous production source was `fb6b4ba`; a code rollback should preserve the cloud payload and new scoped caches. Never replace user data with old seeds during rollback.
