#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="/Users/kirk/.openclaw/workspace"
LOG_DIR="$WORKSPACE/logs"
mkdir -p "$LOG_DIR"

STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
LOG_FILE="$LOG_DIR/daily-dashboard-update.log"

{
  echo "[$STAMP] === daily dashboard update start ==="
  cd "$WORKSPACE"

  /usr/bin/python3 "$WORKSPACE/scripts/update_hyvs_mavs_dashboard.py"
  /usr/bin/python3 "$WORKSPACE/scripts/update_audience_dashboard.py" --skip-git

  git add \
    docs/emma-analysis/hyvs_mavs_dashboard.html \
    docs/emma-analysis/daily_metrics_6m.csv \
    docs/emma-analysis/member_breakpoint_by_month.csv \
    docs/emma-analysis/daily_reg_cohort.csv \
    docs/emma-analysis/daily_919_stock.csv \
    docs/emma-analysis/daily_919_recovery.csv \
    docs/emma-analysis/policy_reminder_cohort.csv \
    invoice-prototype/public/hyvs-mavs-dashboard.html \
    invoice-prototype/public/dashboard/hyvs-mavs/index.html \
    invoice-prototype/dist/hyvs-mavs-dashboard.html \
    invoice-prototype/dist/dashboard/hyvs-mavs/index.html \
    docs/audience_dashboard.html || true

  if git diff --cached --quiet; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No dashboard changes to commit"
  else
    git commit -m "chore: daily dashboard refresh ($(date '+%Y-%m-%d'))"
    git push origin main
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushed updated dashboards"
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] === daily dashboard update end ==="
} >> "$LOG_FILE" 2>&1
