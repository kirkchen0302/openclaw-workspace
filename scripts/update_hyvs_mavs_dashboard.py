#!/usr/bin/env python3
from __future__ import annotations

import argparse
import calendar
import csv
import json
import re
import shutil
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

from google.auth.transport.requests import Request
from google.cloud import bigquery
from google.oauth2.credentials import Credentials

WORKSPACE = Path('/Users/kirk/.openclaw/workspace')
DOCS_DIR = WORKSPACE / 'docs' / 'emma-analysis'
HTML_PATH = DOCS_DIR / 'hyvs_mavs_dashboard.html'
PUBLIC_HTML_PATH = WORKSPACE / 'invoice-prototype' / 'public' / 'hyvs-mavs-dashboard.html'
DIST_HTML_PATH = WORKSPACE / 'invoice-prototype' / 'dist' / 'hyvs-mavs-dashboard.html'
SQL_PATH = DOCS_DIR / 'daily_metrics_6m.sql'
CSV_PATH = DOCS_DIR / 'daily_metrics_6m.csv'
IOS_CSV_PATH = DOCS_DIR / 'ios_first_downloads.csv'
IOS_CSV_ALT_PATH = DOCS_DIR / '發票存摺：統一發票雲端對獎＋電子發票載具歸戶＋發票回饋兌獎-首次下載次數-20170924-20260318.csv'
ANDROID_MD_PATH = DOCS_DIR / 'android_downloads.md'
STOCK_919_PATH = DOCS_DIR / 'daily_919_stock.csv'
POLICY_COHORT_PATH = DOCS_DIR / 'policy_reminder_cohort.csv'
REG_COHORT_PATH = DOCS_DIR / 'daily_reg_cohort.csv'
RECOVERY_919_PATH = DOCS_DIR / 'daily_919_recovery.csv'
BREAKPOINT_PATH = DOCS_DIR / 'member_breakpoint_by_month.csv'
ADC_PATH = WORKSPACE / '.gcp' / 'adc.json'
BQ_PROJECT = 'production-379804'
HYVS_TARGET = 5_000_000
MAVS_BASELINE = 2_216_711
MAVS_TARGET = 3_016_711
ANDROID_TARGET = 400_000
IOS_TARGET = 600_000
START_919 = date(2025, 7, 1)
START_REG = date(2025, 7, 1)
START_POLICY = date(2025, 7, 1)


@dataclass
class SourceMeta:
    metrics_last: date
    ios_last: date | None
    android_last: date | None
    stock_919_last: date | None
    policy_last: date | None


def month_start(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, delta: int) -> date:
    y = d.year + (d.month - 1 + delta) // 12
    m = (d.month - 1 + delta) % 12 + 1
    return date(y, m, 1)


def fmt_int(n: int) -> str:
    return f"{n:,}"


def fmt_short_date(d: date | None) -> str:
    return '-' if d is None else f'{d.month}/{d.day}'


def pct(v: int, t: int) -> float:
    return 0.0 if not t else v / t * 100


def get_bq_client() -> bigquery.Client:
    info = json.loads(ADC_PATH.read_text())
    creds = Credentials(
        token=None,
        refresh_token=info['refresh_token'],
        client_id=info['client_id'],
        client_secret=info['client_secret'],
        token_uri='https://oauth2.googleapis.com/token',
    )
    creds.refresh(Request())
    return bigquery.Client(credentials=creds, project=BQ_PROJECT)


def read_csv_dicts(path: Path) -> list[dict[str, str]]:
    with path.open() as f:
        return list(csv.DictReader(f))


def write_csv_dicts(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        raise RuntimeError(f'no rows for {path.name}')
    fieldnames = list(rows[0].keys())
    with path.open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: '' if v is None else v for k, v in row.items()})


def query_rows(client: bigquery.Client, sql: str) -> list[dict[str, object]]:
    rows = list(client.query(sql).result())
    if not rows:
        return []
    out: list[dict[str, object]] = []
    for row in rows:
        out.append({k: row[k] for k in row.keys()})
    return out


def refresh_daily_metrics_csv(client: bigquery.Client) -> list[dict[str, str]]:
    end_date = date.today()
    start_date = add_months(month_start(end_date), -6)
    sql = SQL_PATH.read_text()
    sql = re.sub(r"DECLARE report_start DATE DEFAULT '\d{4}-\d{2}-\d{2}';", f"DECLARE report_start DATE DEFAULT '{start_date.isoformat()}';", sql)
    sql = re.sub(r"DECLARE report_end DATE DEFAULT '\d{4}-\d{2}-\d{2}';", f"DECLARE report_end DATE DEFAULT '{end_date.isoformat()}';", sql)
    SQL_PATH.write_text(sql)

    rows = query_rows(client, sql)
    if not rows:
        raise RuntimeError('BigQuery returned no rows')
    write_csv_dicts(CSV_PATH, rows)
    return read_csv_dicts(CSV_PATH)


def parse_metrics(rows: list[dict[str, str]]) -> list[dict]:
    out = []
    for row in rows:
        out.append({
            'date': date.fromisoformat(row['date']),
            'total_member': int(row['total_member']),
            'new_register_n': int(row['new_register_n']),
            'delete_s': int(row['delete_s']),
            'undeleted_e': int(row['undeleted_e']),
            'mavs_total': int(row['mavs_total']),
            'hyvs_total': int(row['hyvs_total']),
            'policy_valid': int(row['policy_valid']),
            'carrier_valid': int(row['carrier_valid']),
            'has_invoice': int(row['has_invoice']),
            'active_30d': int(row['active_30d']),
        })
    return out


def parse_ios_downloads(path: Path) -> list[tuple[date, int]]:
    lines = path.read_text().splitlines()
    data = []
    for line in lines:
        if not line or line.startswith(('名稱', '開始日期', '結束日期', '日期,')):
            continue
        parts = [p.strip() for p in line.split(',')]
        if len(parts) != 2:
            continue
        try:
            d = datetime.strptime(parts[0], '%Y/%m/%d').date()
            v = int(round(float(parts[1])))
        except Exception:
            continue
        data.append((d, v))
    return data


def parse_android_monthly(md_path: Path) -> list[tuple[str, int, int | None]]:
    rows = []
    for line in md_path.read_text().splitlines():
        if not line.startswith('| 20'):
            continue
        parts = [p.strip() for p in line.strip('|').split('|')]
        if len(parts) < 3:
            continue
        month_label = parts[0]
        month = re.search(r'(20\d{2}-\d{2})', month_label)
        if not month:
            continue
        partial = re.search(r'至(\d+)日', month_label)
        rows.append((month.group(1), int(parts[2].replace(',', '')), int(partial.group(1)) if partial else None))
    return rows


def month_key(d: date) -> str:
    return f'{d.year:04d}-{d.month:02d}'


def build_download_series(ios_daily: list[tuple[date, int]], android_monthly: list[tuple[str, int, int | None]], metrics: list[dict]):
    ios_by_day = {d: v for d, v in ios_daily}
    ios_by_month = defaultdict(int)
    for d, v in ios_daily:
        ios_by_month[month_key(d)] += v

    reg_by_month = defaultdict(int)
    for r in metrics:
        reg_by_month[month_key(r['date'])] += r['new_register_n']

    android_daily = {}
    android_meta_last = None
    for month, total, partial_day in android_monthly:
        y, m = map(int, month.split('-'))
        usable_days = partial_day or calendar.monthrange(y, m)[1]
        dates = [date(y, m, day) for day in range(1, usable_days + 1)]
        weights = [ios_by_day.get(d, 0) for d in dates]
        if sum(weights) <= 0:
            weights = [1] * len(dates)
        weight_sum = sum(weights)
        allocated = []
        running = 0
        for i, w in enumerate(weights, start=1):
            val = total - running if i == len(weights) else round(total * w / weight_sum)
            if i != len(weights):
                running += val
            allocated.append(val)
        allocated[-1] += total - sum(allocated)
        for d, v in zip(dates, allocated):
            android_daily[d] = v
        android_meta_last = dates[-1] if android_meta_last is None else max(android_meta_last, dates[-1])

    monthly = []
    all_months = sorted(set(reg_by_month) | set(ios_by_month) | {m for m, _, _ in android_monthly})
    for month in all_months:
        monthly.append({
            'month': month,
            'ios': ios_by_month.get(month, 0),
            'android': sum(v for d, v in android_daily.items() if month_key(d) == month),
            'register': reg_by_month.get(month, 0),
        })

    daily = []
    for d in sorted(set(ios_by_day) | set(android_daily)):
        daily.append({'date': d, 'ios': ios_by_day.get(d, 0), 'android': android_daily.get(d, 0)})
    return monthly, daily, android_meta_last


def read_last_csv_date(path: Path) -> date | None:
    rows = read_csv_dicts(path)
    if not rows:
        return None
    first_key = next(iter(rows[-1].keys()))
    return date.fromisoformat(rows[-1][first_key])


def js_array(records: Iterable[dict], fields: list[str]) -> str:
    lines = []
    for rec in records:
        parts = []
        for field in fields:
            v = rec[field]
            if isinstance(v, date):
                parts.append(f"{field}:'{v.isoformat()}'")
            elif isinstance(v, str):
                parts.append(f"{field}:'{v}'")
            elif v is None:
                parts.append(f'{field}:null')
            else:
                parts.append(f'{field}:{v}')
        lines.append('      {' + ','.join(parts) + '},')
    return '\n'.join(lines)


def replace_once(text: str, pattern: str, repl: str, flags: int = re.S) -> str:
    new_text, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'pattern not found exactly once: {pattern[:80]}')
    return new_text


def parse_existing_trend_data(html: str) -> dict[str, dict[str, int | None]]:
    m = re.search(r"window\._trendChartData = \[(.*?)\n\s*\];", html, re.S)
    if not m:
        return {}
    out = {}
    for rec in re.finditer(r"\{date:'([^']+)',hyvs:(null|\d+),mavs:(null|\d+)\}", m.group(1)):
        out[rec.group(1)] = {
            'hyvs': None if rec.group(2) == 'null' else int(rec.group(2)),
            'mavs': None if rec.group(3) == 'null' else int(rec.group(3)),
        }
    return out


def apply_metric_safeguards(metrics: list[dict], existing_trend: dict[str, dict[str, int | None]]) -> list[dict]:
    fixed = []
    suspicious_mavs = metrics and metrics[-1]['mavs_total'] < 100_000
    for row in metrics:
        r = dict(row)
        old = existing_trend.get(r['date'].isoformat())
        if suspicious_mavs and old and old.get('mavs'):
            r['mavs_total'] = old['mavs']
        fixed.append(r)
    return fixed


def sql_breakpoints() -> str:
    return f"""
WITH members AS (
  SELECT member_hk, CAST(created_at AS DATE) AS reg_date
  FROM `production-379804.intermediate.sat__member`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY member_hk ORDER BY effective_from DESC) = 1
),
carrier_any AS (
  SELECT DISTINCT member_hk
  FROM `production-379804.base_marts.base__link__member_carrier`
),
carrier_ok AS (
  SELECT DISTINCT mc.member_hk
  FROM `production-379804.intermediate.sat__carrier` c
  JOIN `production-379804.base_marts.base__link__member_carrier` mc USING(carrier_hk)
  WHERE c.is_active = TRUE
),
policy_ok AS (
  SELECT DISTINCT member_hk
  FROM `production-379804.intermediate.ma_sat__member_policy_statement`
  WHERE CAST(effective_from AS DATE) <= CURRENT_DATE('Asia/Taipei')
    AND DATE_ADD(CAST(effective_from AS DATE), INTERVAL 180 DAY) > CURRENT_DATE('Asia/Taipei')
),
active_30d AS (
  SELECT DISTINCT CAST(user_id AS INT64) AS member_id
  FROM `invoice-bfd85.analytics_382839978.events_intraday_*`
  WHERE event_name = 'session_start' AND user_id IS NOT NULL AND user_id != ''
),
active_members AS (
  SELECT DISTINCT h.member_hk
  FROM active_30d a
  JOIN `production-379804.base_marts.base__hub__member` h ON h.member_id = a.member_id
),
hyvs AS (
  SELECT DISTINCT mi.member_hk
  FROM `production-379804.intermediate.sat__invoice` i
  JOIN `production-379804.base_marts.base__link__member_invoice` mi USING(invoice_hk)
  JOIN carrier_ok c ON c.member_hk = mi.member_hk
  JOIN policy_ok p ON p.member_hk = mi.member_hk
  WHERE CAST(i.issued_at AS DATE) >= DATE_SUB(CURRENT_DATE('Asia/Taipei'), INTERVAL 180 DAY)
    AND i.carrier_type IS NOT NULL AND i.carrier_type != ''
)
SELECT FORMAT_DATE('%Y-%m', reg_date) AS reg_month,
  COUNT(*) AS total,
  COUNTIF(m.member_hk IN (SELECT member_hk FROM active_members)) AS active_30d,
  COUNTIF(m.member_hk IN (SELECT member_hk FROM carrier_ok)) AS carrier_ok,
  COUNTIF(m.member_hk IN (SELECT member_hk FROM carrier_any) AND m.member_hk NOT IN (SELECT member_hk FROM carrier_ok)) AS n919,
  COUNTIF(m.member_hk NOT IN (SELECT member_hk FROM carrier_any)) AS no_carrier,
  COUNTIF(m.member_hk IN (SELECT member_hk FROM policy_ok)) AS policy_ok,
  COUNTIF(m.member_hk IN (SELECT member_hk FROM hyvs)) AS hyvs
FROM members m
GROUP BY reg_month
ORDER BY reg_month
"""


def sql_daily_reg() -> str:
    return f"""
DECLARE start_date DATE DEFAULT '{START_REG.isoformat()}';
WITH regs AS (
  SELECT member_hk, CAST(created_at AS DATE) AS reg_date
  FROM `production-379804.intermediate.sat__member`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY member_hk ORDER BY effective_from DESC) = 1
),
cohort AS (
  SELECT * FROM regs WHERE reg_date >= start_date
),
carrier_events AS (
  SELECT mc.member_hk, MIN(CAST(c.effective_from AS DATE)) AS carrier_date
  FROM `production-379804.intermediate.sat__carrier` c
  JOIN `production-379804.base_marts.base__link__member_carrier` mc USING(carrier_hk)
  WHERE c.is_active = TRUE
  GROUP BY mc.member_hk
),
policy_events AS (
  SELECT member_hk, MIN(CAST(effective_from AS DATE)) AS policy_date
  FROM `production-379804.intermediate.ma_sat__member_policy_statement`
  GROUP BY member_hk
),
invoice_daily AS (
  SELECT mi.member_hk, CAST(i.issued_at AS DATE) AS invoice_date
  FROM `production-379804.intermediate.sat__invoice` i
  JOIN `production-379804.base_marts.base__link__member_invoice` mi USING(invoice_hk)
  WHERE i.carrier_type IS NOT NULL AND i.carrier_type != ''
),
inv_rollup AS (
  SELECT c.reg_date AS date,
    COUNT(*) AS total,
    COUNTIF(ce.carrier_date <= c.reg_date) AS carrier_d0,
    COUNTIF(ce.carrier_date <= DATE_ADD(c.reg_date, INTERVAL 7 DAY)) AS carrier_d7,
    COUNTIF(pe.policy_date <= c.reg_date) AS policy_d0,
    COUNT(DISTINCT CASE WHEN i.invoice_date BETWEEN c.reg_date AND DATE_ADD(c.reg_date, INTERVAL 7 DAY) THEN c.member_hk END) AS inv_d7,
    COUNT(DISTINCT CASE WHEN i.invoice_date BETWEEN c.reg_date AND DATE_ADD(c.reg_date, INTERVAL 30 DAY) THEN c.member_hk END) AS inv_d30
  FROM cohort c
  LEFT JOIN carrier_events ce USING(member_hk)
  LEFT JOIN policy_events pe USING(member_hk)
  LEFT JOIN invoice_daily i USING(member_hk)
  GROUP BY date
)
SELECT * FROM inv_rollup ORDER BY date
"""


def sql_919_stock() -> str:
    return f"""
DECLARE start_date DATE DEFAULT '{START_919.isoformat()}';
WITH dates AS (SELECT d AS date FROM UNNEST(GENERATE_DATE_ARRAY(start_date, CURRENT_DATE('Asia/Taipei'))) d),
carrier_days AS (
  SELECT d.date, COUNT(DISTINCT mc.member_hk) AS total
  FROM dates d
  JOIN `production-379804.intermediate.sat__carrier` c
    ON CAST(c.effective_from AS DATE) <= d.date
  JOIN `production-379804.base_marts.base__link__member_carrier` mc USING(carrier_hk)
  WHERE c.is_active = FALSE
  GROUP BY d.date
)
SELECT date, total FROM carrier_days ORDER BY date
"""


def sql_919_recovery() -> str:
    return f"""
DECLARE start_date DATE DEFAULT '{START_919.isoformat()}';
WITH inactive AS (
  SELECT mc.member_hk, CAST(c.effective_from AS DATE) AS inactive_date
  FROM `production-379804.intermediate.sat__carrier` c
  JOIN `production-379804.base_marts.base__link__member_carrier` mc USING(carrier_hk)
  WHERE c.is_active = FALSE AND CAST(c.effective_from AS DATE) >= start_date
),
active AS (
  SELECT mc.member_hk, CAST(c.effective_from AS DATE) AS active_date
  FROM `production-379804.intermediate.sat__carrier` c
  JOIN `production-379804.base_marts.base__link__member_carrier` mc USING(carrier_hk)
  WHERE c.is_active = TRUE
),
paired AS (
  SELECT i.member_hk, i.inactive_date,
    MIN(a.active_date) AS recovered_date
  FROM inactive i
  LEFT JOIN active a ON a.member_hk = i.member_hk AND a.active_date > i.inactive_date
  GROUP BY i.member_hk, i.inactive_date
)
SELECT inactive_date AS date,
  COUNT(*) AS total,
  COUNTIF(recovered_date <= DATE_ADD(inactive_date, INTERVAL 1 DAY)) AS d1,
  COUNTIF(recovered_date <= DATE_ADD(inactive_date, INTERVAL 3 DAY)) AS d3,
  COUNTIF(recovered_date <= DATE_ADD(inactive_date, INTERVAL 7 DAY)) AS d7,
  COUNTIF(recovered_date <= DATE_ADD(inactive_date, INTERVAL 14 DAY)) AS d14,
  COUNTIF(recovered_date <= DATE_ADD(inactive_date, INTERVAL 30 DAY)) AS d30,
  COUNTIF(recovered_date <= DATE_ADD(inactive_date, INTERVAL 60 DAY)) AS d60,
  COUNTIF(recovered_date <= DATE_ADD(inactive_date, INTERVAL 90 DAY)) AS d90,
  COUNTIF(recovered_date IS NULL) AS never
FROM paired
GROUP BY date
ORDER BY date
"""


def sql_policy_cohort() -> str:
    return f"""
DECLARE start_date DATE DEFAULT '{START_POLICY.isoformat()}';
WITH policy AS (
  SELECT member_hk, CAST(effective_from AS DATE) AS accepted_date
  FROM `production-379804.intermediate.ma_sat__member_policy_statement`
),
base AS (
  SELECT member_hk, accepted_date, DATE_ADD(accepted_date, INTERVAL 110 DAY) AS d0_date
  FROM policy
  WHERE DATE_ADD(accepted_date, INTERVAL 110 DAY) >= start_date
),
next_accept AS (
  SELECT b.member_hk, b.d0_date, b.accepted_date,
    MIN(p.accepted_date) AS renew_date
  FROM base b
  LEFT JOIN policy p ON p.member_hk = b.member_hk AND p.accepted_date > b.accepted_date
  GROUP BY b.member_hk, b.d0_date, b.accepted_date
)
SELECT d0_date,
  COUNT(*) AS total,
  COUNTIF(renew_date < d0_date) AS before_reminder,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 0 DAY)) AS d0,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 3 DAY)) AS d3,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 7 DAY)) AS d7,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 14 DAY)) AS d14,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 30 DAY)) AS d30,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 50 DAY)) AS d50,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 70 DAY)) AS d70,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 77 DAY)) AS exp7,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 84 DAY)) AS exp14,
  COUNTIF(renew_date <= DATE_ADD(d0_date, INTERVAL 100 DAY)) AS exp30,
  COUNTIF(renew_date IS NULL) AS never_renewed
FROM next_accept
GROUP BY d0_date
ORDER BY d0_date
"""


def refresh_live_supporting_csvs(client: bigquery.Client) -> None:
    queries = [
        (BREAKPOINT_PATH, sql_breakpoints()),
        (REG_COHORT_PATH, sql_daily_reg()),
        (STOCK_919_PATH, sql_919_stock()),
        (RECOVERY_919_PATH, sql_919_recovery()),
        (POLICY_COHORT_PATH, sql_policy_cohort()),
    ]
    for path, sql in queries:
        rows = query_rows(client, sql)
        if rows:
            cooked = []
            for row in rows:
                cooked.append({k: (v.isoformat() if isinstance(v, date) else v) for k, v in row.items()})
            write_csv_dicts(path, cooked)


def render_breakpoint_js(rows: list[dict[str, str]]) -> str:
    lines = []
    for r in rows:
        lines.append("      {month:'%s',total:%s,active:%s,carrierOk:%s,n919:%s,noCarrier:%s,policy:%s,hyvs:%s}," % (
            r['reg_month'], r['total'], r['active_30d'], r['carrier_ok'], r['n919'], r['no_carrier'], r['policy_ok'], r['hyvs']))
    return 'const breakpointData = [\n' + '\n'.join(lines) + '\n    ];'


def pct_str(n: int, total: int) -> str:
    return f'{(n / total * 100 if total else 0):.1f}%'


def render_daily_reg_js(rows: list[dict[str, str]]) -> str:
    lines = []
    for r in rows:
        total = int(r['total'])
        lines.append("      ['%s','%s','%s','%s','%s','%s','%s']," % (
            r['date'], fmt_int(total), pct_str(int(r['carrier_d0']), total), pct_str(int(r['carrier_d7']), total), pct_str(int(r['policy_d0']), total), pct_str(int(r['inv_d7']), total), pct_str(int(r['inv_d30']), total)))
    return 'const dailyRegData=[\n' + '\n'.join(lines) + '\n    ];'


def render_stock_js(rows: list[dict[str, str]]) -> str:
    lines = [f'{{date:"{r["date"]}",stock:{r["total"]}}},' for r in rows]
    return 'const stock919Data = [\n' + '\n'.join('      ' + x for x in lines) + '\n  ];'


def render_daily_919_js(rows: list[dict[str, str]]) -> str:
    lines = [f"{{date:'{r['date']}',count:{r['total']}}}," for r in rows]
    return 'const daily919Data = [\n' + '\n'.join('      ' + x for x in lines) + '\n  ];'


def render_policy_daily_js(metrics: list[dict]) -> str:
    lines = []
    for r in metrics:
        expired = max(r['undeleted_e'] - r['policy_valid'], 0)
        lines.append(f"{{date:'{r['date'].isoformat()}',active:{r['policy_valid']},expired:{expired}}},")
    return 'const dailyPolicyData = [\n' + '\n'.join('      ' + x for x in lines) + '\n  ];'


def render_recovery_js(rows: list[dict[str, str]]) -> tuple[str, str]:
    daily_lines = []
    monthly = defaultdict(lambda: {'total': 0, 'd1': 0, 'd3': 0, 'd7': 0, 'd14': 0, 'd30': 0, 'd60': 0, 'd90': 0, 'never': 0})
    for r in rows:
        total = int(r['total'])
        vals = {k: int(r[k]) for k in ['d1', 'd3', 'd7', 'd14', 'd30', 'd60', 'd90', 'never']}
        daily_lines.append("      ['%s','%s','%s','%s','%s','%s','%s','%s','%s','%s','—']," % (
            r['date'], fmt_int(total), pct_str(vals['d1'], total), pct_str(vals['d3'], total), pct_str(vals['d7'], total), pct_str(vals['d14'], total), pct_str(vals['d30'], total), pct_str(vals['d60'], total), pct_str(vals['d90'], total), pct_str(vals['never'], total)))
        m = r['date'][:7]
        monthly[m]['total'] += total
        for k, v in vals.items():
            monthly[m][k] += v
    monthly_lines = []
    for m in sorted(monthly):
        total = monthly[m]['total']
        d = monthly[m]
        monthly_lines.append("      ['%s','%s','%s','%s','%s','%s','%s','%s','%s','%s','—']," % (
            m, fmt_int(total), pct_str(d['d1'], total), pct_str(d['d3'], total), pct_str(d['d7'], total), pct_str(d['d14'], total), pct_str(d['d30'], total), pct_str(d['d60'], total), pct_str(d['d90'], total), pct_str(d['never'], total)))
    return 'const recoveryData=[\n' + '\n'.join(monthly_lines) + '\n    ];', 'const dailyRecoveryData=[\n' + '\n'.join(daily_lines) + '\n    ];'


def render_policy_cohort_js(rows: list[dict[str, str]]) -> str:
    lines = []
    for r in rows:
        total = int(r['total'])
        lines.append("      ['%s','%s','%s','%s','%s','%s','%s','%s','%s','%s','%s','%s','%s','%s']," % (
            r['d0_date'], fmt_int(total), pct_str(int(r['before_reminder']), total), pct_str(int(r['d0']), total), pct_str(int(r['d3']), total), pct_str(int(r['d7']), total), pct_str(int(r['d14']), total), pct_str(int(r['d30']), total), pct_str(int(r['d50']), total), pct_str(int(r['d70']), total), pct_str(int(r['exp7']), total), pct_str(int(r['exp14']), total), pct_str(int(r['exp30']), total), pct_str(int(r['never_renewed']), total)))
    return 'const dailyPolicyCohort=[\n' + '\n'.join(lines) + '\n    ];'


def update_html(html: str, metrics: list[dict], monthly_downloads: list[dict], daily_downloads: list[dict], meta: SourceMeta) -> str:
    last = metrics[-1]
    last_date = last['date']
    last_mavs_nonzero = next((r for r in reversed(metrics) if r['mavs_total'] > 0), last)
    hyvs_gap = HYVS_TARGET - last['hyvs_total']
    mavs_to_baseline = last_mavs_nonzero['mavs_total'] - MAVS_BASELINE
    mavs_to_target = last_mavs_nonzero['mavs_total'] - MAVS_TARGET
    android_ytd = sum(r['android'] for r in monthly_downloads if r['month'].startswith(str(last_date.year)))
    ios_ytd = sum(r['ios'] for r in monthly_downloads if r['month'].startswith(str(last_date.year)))
    download_last = max([d['date'] for d in daily_downloads], default=None)

    badge = f'📅 MAVS 至 {fmt_short_date(last_mavs_nonzero["date"])} ｜ HYVS 至 {fmt_short_date(last_date)} ｜ 919 至 {fmt_short_date(meta.stock_919_last)} ｜ Policy 至 {fmt_short_date(meta.policy_last)}'
    footer = f'MAVS 至 {fmt_short_date(last_mavs_nonzero["date"])} ｜ HYVS 至 {fmt_short_date(last_date)} ｜ 919 至 {fmt_short_date(meta.stock_919_last)} ｜ Policy 至 {fmt_short_date(meta.policy_last)} ｜ BigQuery 原始資料 ｜ Android: Play Console（月資料按日分配）｜ iOS: App Store Connect CSV'
    html = replace_once(html, r'<span class="badge-date">.*?</span>', f'<span class="badge-date">{badge}</span>')
    html = replace_once(html, r'<footer>\s*<div class="container">.*?</div>\s*</footer>', f'<footer>\n  <div class="container">\n    {footer}\n  </div>\n</footer>')

    html = replace_once(html, r'(<div class="big-num hyvs">)([\d,]+)(</div><span[^>]*>截至 )(\d+/\d+)(</span>)', rf'\g<1>{fmt_int(last["hyvs_total"])}\g<3>{fmt_short_date(last_date)}\g<5>')
    html = replace_once(html, r'需再增加 <strong style="color:var\(--accent-cyan\)">[\d,]+</strong>', f'需再增加 <strong style="color:var(--accent-cyan)">{fmt_int(hyvs_gap)}</strong>')
    html = replace_once(html, r'(<div class="big-num mavs">)([\d,]+)(</div><span[^>]*>截至 )(\d+/\d+)(</span>)', rf'\g<1>{fmt_int(last_mavs_nonzero["mavs_total"])}\g<3>{fmt_short_date(last_mavs_nonzero["date"])}\g<5>')
    html = replace_once(html, r'⚠️ Q1 現況：距基準 <strong>[-+\d,]+</strong>｜距年度目標 <strong>[-+\d,]+</strong>', f'⚠️ Q1 現況：距基準 <strong>{mavs_to_baseline:+,}</strong>｜距年度目標 <strong>{mavs_to_target:+,}</strong>')

    download_date_label = fmt_short_date(download_last)
    android_pct_text = f'{pct(android_ytd, ANDROID_TARGET):.1f}%'
    ios_pct_text = f'{pct(ios_ytd, IOS_TARGET):.1f}%'
    html = replace_once(html, r'(🤖 Android 新下載</div>\s*<div class="card-subtitle">年度目標 400,000（YTD 至 )\d+/\d+(）)', rf'\g<1>{download_date_label}\g<2>')
    html = replace_once(html, r'(<div class="big-num" style="background:var\(--grad-android\);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">)[\d,]+(</div>\s*<div style="font-size:.88rem;color:var\(--text-dim\)">/ 400,000</div>\s*<div style="font-size:.88rem;color:var\(--accent-green\);font-weight:700">)[\d.]+%(</div>)', rf'\g<1>{fmt_int(android_ytd)}\g<2>{android_pct_text}\g<3>')
    html = replace_once(html, r'(<div class="progress-label"><span>年度進度</span><span>)[\d.]+%(</span></div>\s*<div class="progress-bar"><div class="fill android" id="dl-android" style="width:)[\d.]+%(\"></div></div>)', rf'\g<1>{android_pct_text}\g<2>{android_pct_text}\g<3>')
    html = replace_once(html, r'(<div class="q-label">Q1 實際</div>\s*<div class="q-num" style="color:#34d399">)[\d,]+(</div>\s*<div class="q-sub">And )[\d.]+K / iOS [\d.]+K(</div>)', rf'\g<1>{fmt_int(android_ytd)}\g<2>{android_ytd/1000:.1f}K / iOS {ios_ytd/1000:.1f}K\g<3>')
    html = replace_once(html, r'(🍎 iOS 新下載</div>\s*<div class="card-subtitle">年度目標 600,000（YTD 至 )\d+/\d+(）)', rf'\g<1>{download_date_label}\g<2>')
    html = replace_once(html, r'(<div class="big-num" style="background:var\(--grad-ios\);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">)[\d,]+(</div>\s*<div style="font-size:.88rem;color:var\(--text-dim\)">/ 600,000</div>\s*<div style="font-size:.88rem;color:var\(--accent-blue\);font-weight:700">)[\d.]+%(</div>)', rf'\g<1>{fmt_int(ios_ytd)}\g<2>{ios_pct_text}\g<3>')
    html = replace_once(html, r'(<div class="progress-label"><span>年度進度</span><span>)[\d.]+%(</span></div>\s*<div class="progress-bar"><div class="fill ios" id="dl-ios" style="width:)[\d.]+%(\"></div></div>)', rf'\g<1>{ios_pct_text}\g<2>{ios_pct_text}\g<3>')
    html = replace_once(html, r'(<div class="q-label">Q1 實際</div>\s*<div class="q-num" style="color:#60a5fa">)[\d,]+(</div>\s*<div class="q-sub">And )[\d.]+K / iOS [\d.]+K(</div>)', rf'\g<1>{fmt_int(ios_ytd)}\g<2>{android_ytd/1000:.1f}K / iOS {ios_ytd/1000:.1f}K\g<3>')

    trend_records = [{'date': r['date'], 'hyvs': None if r['hyvs_total'] == 0 else r['hyvs_total'], 'mavs': None if r['mavs_total'] == 0 else r['mavs_total']} for r in metrics]
    html = replace_once(html, r'window\._trendChartData = \[.*?\n\s*\];', 'window._trendChartData = [\n' + js_array(trend_records, ['date', 'hyvs', 'mavs']) + '\n    ];')
    html = replace_once(html, r'const downloadData = \[.*?\n\s*\];', 'const downloadData = [\n' + js_array(monthly_downloads, ['month', 'ios', 'android', 'register']) + '\n    ];')
    html = replace_once(html, r'const dailyDownloadData = \[.*?\n\s*\];', 'const dailyDownloadData = [\n' + js_array(daily_downloads, ['date', 'ios', 'android']) + '\n    ];')

    html = replace_once(html, r'const breakpointData = \[.*?\n\s*\];', render_breakpoint_js(read_csv_dicts(BREAKPOINT_PATH)))
    html = replace_once(html, r'const dailyRegData=\[.*?\n\s*\];', render_daily_reg_js(read_csv_dicts(REG_COHORT_PATH)))
    rec_monthly, rec_daily = render_recovery_js(read_csv_dicts(RECOVERY_919_PATH))
    html = replace_once(html, r'const recoveryData=\[.*?\n\s*\];', rec_monthly)
    html = replace_once(html, r'const dailyRecoveryData=\[.*?\n\s*\];', rec_daily)
    html = replace_once(html, r'const dailyPolicyCohort=\[.*?\n\s*\];', render_policy_cohort_js(read_csv_dicts(POLICY_COHORT_PATH)))
    html = replace_once(html, r'const daily919Data = \[.*?\n\s*\];', render_daily_919_js(read_csv_dicts(RECOVERY_919_PATH)))
    html = replace_once(html, r'const stock919Data = \[.*?\n\s*\];', render_stock_js(read_csv_dicts(STOCK_919_PATH)))
    html = replace_once(html, r'const dailyPolicyData = \[.*?\n\s*\];', render_policy_daily_js(metrics))

    init_js = f'''window.addEventListener('DOMContentLoaded', () => {{\n  setTimeout(() => {{\n    const hyvsP = pct({last['hyvs_total']},5000000);\n    document.getElementById('hyvs-fill').style.width = hyvsP+'%';\n    document.getElementById('hyvs-pct').textContent = hyvsP+'%';\n    const mavsP = pct({last_mavs_nonzero['mavs_total']},3016711);\n    document.getElementById('mavs-fill').style.width = mavsP+'%';\n    document.getElementById('mavs-pct').textContent = mavsP+'%';\n    document.getElementById('mavs-baseline').style.left = pct(2216711,3016711)+'%';\n    document.getElementById('dl-android').style.width = pct({android_ytd},400000)+'%';\n    document.getElementById('dl-ios').style.width = pct({ios_ytd},600000)+'%';\n    const q2 = document.getElementById('hyvs-q2'); if(q2) q2.style.width = '0%';\n  }}, 200);'''
    html = replace_once(html, r"window\.addEventListener\('DOMContentLoaded', \(\) => \{\s*setTimeout\(\(\) => \{.*?const q2 = document\.getElementById\('hyvs-q2'\); if\(q2\) q2\.style\.width = '0%';\s*\}, 200\);", init_js)
    return html


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--skip-bq', action='store_true', help='Use existing daily_metrics_6m.csv instead of rerunning BigQuery')
    args = parser.parse_args()

    source_html = HTML_PATH.read_text()
    existing_trend = parse_existing_trend_data(source_html)
    client = get_bq_client()

    if args.skip_bq:
        metrics_rows = read_csv_dicts(CSV_PATH)
    else:
        metrics_rows = refresh_daily_metrics_csv(client)
        refresh_live_supporting_csvs(client)
    metrics = apply_metric_safeguards(parse_metrics(metrics_rows), existing_trend)

    ios_daily = parse_ios_downloads(IOS_CSV_PATH if IOS_CSV_PATH.exists() else IOS_CSV_ALT_PATH)
    monthly_downloads, daily_downloads, android_last = build_download_series(ios_daily, parse_android_monthly(ANDROID_MD_PATH), metrics)
    meta = SourceMeta(
        metrics_last=metrics[-1]['date'],
        ios_last=ios_daily[-1][0] if ios_daily else None,
        android_last=android_last,
        stock_919_last=read_last_csv_date(STOCK_919_PATH),
        policy_last=read_last_csv_date(POLICY_COHORT_PATH),
    )

    html = update_html(source_html, metrics, monthly_downloads, daily_downloads, meta)
    HTML_PATH.write_text(html)
    shutil.copyfile(HTML_PATH, PUBLIC_HTML_PATH)
    DIST_HTML_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(HTML_PATH, DIST_HTML_PATH)

    mode = 'existing CSV' if args.skip_bq else 'BigQuery + refreshed live CSVs'
    print(f'Updated dashboard from {mode}')
    print(f'Metrics through {meta.metrics_last}')
    print(f'iOS downloads through {meta.ios_last}')
    print(f'Android monthly downloads through {meta.android_last}')
    print(f'919 stock through {meta.stock_919_last}; policy cohort through {meta.policy_last}')


if __name__ == '__main__':
    main()
