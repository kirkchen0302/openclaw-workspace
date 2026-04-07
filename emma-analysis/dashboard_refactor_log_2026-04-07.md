# HYVS/MAVS dashboard refactor log — 2026-04-07

- Continued dashboard automation refactor in `scripts/update_hyvs_mavs_dashboard.py`.
- Extended generator so dashboard JS data blocks are refreshed from source-backed CSV artifacts where available.
- Kept iOS/App Store Connect CSV and Android Play Console markdown sourcing unchanged by design.
- Regenerated:
  - `docs/emma-analysis/hyvs_mavs_dashboard.html`
  - `invoice-prototype/public/hyvs-mavs-dashboard.html`
  - `invoice-prototype/dist/hyvs-mavs-dashboard.html`
- Added a header to `docs/emma-analysis/daily_919_stock.csv` so the updater can parse it consistently.
- Note: I could not identify an existing "lobster file" in the repo, so I created this project log under `docs/emma-analysis/`.


- Fully reran `scripts/update_hyvs_mavs_dashboard.py` with BigQuery refresh using workspace `.venv`.
- Fixed a brittle updater regex so the script now matches the current `DOMContentLoaded` init block and can complete end-to-end.
- Refreshed from SQL / BigQuery source and rewrote these artifacts:
  - `docs/emma-analysis/daily_metrics_6m.csv`
  - `docs/emma-analysis/member_breakpoint_by_month.csv`
  - `docs/emma-analysis/daily_reg_cohort.csv`
  - `docs/emma-analysis/daily_919_stock.csv`
  - `docs/emma-analysis/daily_919_recovery.csv`
  - `docs/emma-analysis/policy_reminder_cohort.csv`
  - `docs/emma-analysis/hyvs_mavs_dashboard.html`
  - `invoice-prototype/public/hyvs-mavs-dashboard.html`
- Kept external/non-SQL download sources as external by design:
  - iOS: `docs/emma-analysis/ios_first_downloads.csv` (App Store Connect export)
  - Android: `docs/emma-analysis/android_downloads.md` (Play Console monthly export, distributed to days using iOS weight profile)
- Added Firebase hosting path copy for the official rewritten route:
  - `invoice-prototype/public/dashboard/hyvs-mavs/index.html`
  - `invoice-prototype/dist/dashboard/hyvs-mavs/index.html`
- Rebuilt and deployed Firebase Hosting successfully.
  - Hosting URL: `https://pm-prototype-a75ce.web.app`
  - Verified official route: `https://pm-prototype-a75ce.web.app/dashboard/hyvs-mavs`
- Resulting displayed cutoffs on page after rerun:
  - MAVS through 4/7
  - HYVS through 4/7
  - 919 through 4/7
  - Policy cohort through 7/26
  - iOS downloads through 3/18
  - Android monthly downloads through 3/20
