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
