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
SQL_PATH = DOCS_DIR / 'daily_metrics_6m.sql'
CSV_PATH = DOCS_DIR / 'daily_metrics_6m.csv'
IOS_CSV_PATH = DOCS_DIR / 'ios_first_downloads.csv'
IOS_CSV_ALT_PATH = DOCS_DIR / '發票存摺：統一發票雲端對獎＋電子發票載具歸戶＋發票回饋兌獎-首次下載次數-20170924-20260318.csv'
ANDROID_MD_PATH = DOCS_DIR / 'android_downloads.md'
STOCK_919_PATH = DOCS_DIR / 'daily_919_stock.csv'
POLICY_COHORT_PATH = DOCS_DIR / 'policy_reminder_cohort.csv'
ADC_PATH = WORKSPACE / '.gcp' / 'adc.json'
BQ_PROJECT = 'production-379804'
HYVS_TARGET = 5_000_000
MAVS_BASELINE = 2_216_711
MAVS_TARGET = 3_016_711
ANDROID_TARGET = 400_000
IOS_TARGET = 600_000


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


def refresh_daily_metrics_csv() -> list[dict[str, str]]:
    end_date = date.today()
    start_date = add_months(month_start(end_date), -6)
    sql = SQL_PATH.read_text()
    sql = re.sub(r"DECLARE report_start DATE DEFAULT '\d{4}-\d{2}-\d{2}';", f"DECLARE report_start DATE DEFAULT '{start_date.isoformat()}';", sql)
    sql = re.sub(r"DECLARE report_end DATE DEFAULT '\d{4}-\d{2}-\d{2}';", f"DECLARE report_end DATE DEFAULT '{end_date.isoformat()}';", sql)
    SQL_PATH.write_text(sql)

    client = get_bq_client()
    rows = list(client.query(sql).result())
    if not rows:
        raise RuntimeError('BigQuery returned no rows')
    fieldnames = [f.name for f in rows[0].keys()]
    with CSV_PATH.open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: '' if row[k] is None else str(row[k]) for k in fieldnames})
    return read_csv_dicts(CSV_PATH)


def read_csv_dicts(path: Path) -> list[dict[str, str]]:
    with path.open() as f:
        return list(csv.DictReader(f))


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
    html = replace_once(html, r'(<div class="progress-label"><span>年度進度</span><span>)[\d.]+%(</span></div>\s*<div class="progress-bar"><div class="fill android" id="dl-android" style="width:)[\d.]+%("></div></div>)', rf'\g<1>{android_pct_text}\g<2>{android_pct_text}\g<3>')
    html = replace_once(html, r'(<div class="q-label">Q1 實際</div>\s*<div class="q-num" style="color:#34d399">)[\d,]+(</div>\s*<div class="q-sub">And )[\d.]+K / iOS [\d.]+K(</div>)', rf'\g<1>{fmt_int(android_ytd)}\g<2>{android_ytd/1000:.1f}K / iOS {ios_ytd/1000:.1f}K\g<3>')
    html = replace_once(html, r'(🍎 iOS 新下載</div>\s*<div class="card-subtitle">年度目標 600,000（YTD 至 )\d+/\d+(）)', rf'\g<1>{download_date_label}\g<2>')
    html = replace_once(html, r'(<div class="big-num" style="background:var\(--grad-ios\);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">)[\d,]+(</div>\s*<div style="font-size:.88rem;color:var\(--text-dim\)">/ 600,000</div>\s*<div style="font-size:.88rem;color:var\(--accent-blue\);font-weight:700">)[\d.]+%(</div>)', rf'\g<1>{fmt_int(ios_ytd)}\g<2>{ios_pct_text}\g<3>')
    html = replace_once(html, r'(<div class="progress-label"><span>年度進度</span><span>)[\d.]+%(</span></div>\s*<div class="progress-bar"><div class="fill ios" id="dl-ios" style="width:)[\d.]+%("></div></div>)', rf'\g<1>{ios_pct_text}\g<2>{ios_pct_text}\g<3>')
    html = replace_once(html, r'(<div class="q-label">Q1 實際</div>\s*<div class="q-num" style="color:#60a5fa">)[\d,]+(</div>\s*<div class="q-sub">And )[\d.]+K / iOS [\d.]+K(</div>)', rf'\g<1>{fmt_int(ios_ytd)}\g<2>{android_ytd/1000:.1f}K / iOS {ios_ytd/1000:.1f}K\g<3>')

    trend_records = [{'date': r['date'], 'hyvs': None if r['hyvs_total'] == 0 else r['hyvs_total'], 'mavs': None if r['mavs_total'] == 0 else r['mavs_total']} for r in metrics]
    html = replace_once(html, r'window\._trendChartData = \[.*?\n\s*\];', 'window._trendChartData = [\n' + js_array(trend_records, ['date', 'hyvs', 'mavs']) + '\n    ];')
    html = replace_once(html, r'const downloadData = \[.*?\n\s*\];', 'const downloadData = [\n' + js_array(monthly_downloads, ['month', 'ios', 'android', 'register']) + '\n    ];')
    html = replace_once(html, r'const dailyDownloadData = \[.*?\n\s*\];', 'const dailyDownloadData = [\n' + js_array(daily_downloads, ['date', 'ios', 'android']) + '\n    ];')

    init_js = f'''window.addEventListener('DOMContentLoaded', () => {{\n  setTimeout(() => {{\n    // HYVS\n    const hyvsP = pct({last['hyvs_total']},5000000);\n    document.getElementById('hyvs-fill').style.width = hyvsP+'%';\n    document.getElementById('hyvs-pct').textContent = hyvsP+'%';\n\n    // MAVS\n    const mavsP = pct({last_mavs_nonzero['mavs_total']},3016711);\n    document.getElementById('mavs-fill').style.width = mavsP+'%';\n    document.getElementById('mavs-pct').textContent = mavsP+'%';\n    document.getElementById('mavs-baseline').style.left = pct(2216711,3016711)+'%';\n\n    // Downloads\n    document.getElementById('dl-android').style.width = pct({android_ytd},400000)+'%';\n    document.getElementById('dl-ios').style.width = pct({ios_ytd},600000)+'%';\n\n    // HYVS Q2 (not started yet, 0%)\n    document.getElementById('hyvs-q2').style.width = '0%';\n  }}, 200);'''
    html = replace_once(html, r"window\.addEventListener\('DOMContentLoaded', \(\) => \{\s*setTimeout\(\(\) => \{.*?document\.getElementById\('hyvs-q2'\)\.style\.width = '0%';\s*\}, 200\);", init_js)
    return html


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--skip-bq', action='store_true', help='Use existing daily_metrics_6m.csv instead of rerunning BigQuery')
    args = parser.parse_args()

    source_html = HTML_PATH.read_text()
    existing_trend = parse_existing_trend_data(source_html)

    if args.skip_bq:
        metrics_rows = read_csv_dicts(CSV_PATH)
    else:
        metrics_rows = refresh_daily_metrics_csv()
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

    mode = 'existing CSV' if args.skip_bq else 'BigQuery + CSV'
    print(f'Updated dashboard from {mode}')
    print(f'Metrics through {meta.metrics_last}')
    print(f'iOS downloads through {meta.ios_last}')
    print(f'Android monthly downloads through {meta.android_last}')
    print(f'919 stock through {meta.stock_919_last}; policy cohort through {meta.policy_last}')


if __name__ == '__main__':
    main()
