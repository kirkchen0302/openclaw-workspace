#!/usr/bin/env python3
"""
受眾回訪分析 Dashboard 每日更新腳本
快照基準：2026-03-14（固定時間點定義四群）
每天跑一次，更新資料並推到 GitHub Pages
"""
import json, subprocess, sys, os
from datetime import datetime
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google.cloud import bigquery

WORKSPACE = os.path.expanduser("~/.openclaw/workspace")
SNAPSHOT_DATE = "2026-03-22"
TREND_START = "2026-03-01"
REPORT_PATH = f"{WORKSPACE}/docs/audience_dashboard.html"
BQ_PROJECT = "production-379804"

LABELS = {
    'ios_active_30d': 'iOS 近30天活躍',
    'ios_inactive_30d': 'iOS >30天未活躍',
    'android_active_30d': 'Android 近30天活躍',
    'android_inactive_30d': 'Android >30天未活躍',
}
COLORS = {
    'ios_active_30d': '#007AFF',
    'ios_inactive_30d': '#5AC8FA',
    'android_active_30d': '#34C759',
    'android_inactive_30d': '#30D158',
}
ORDER = ['ios_active_30d','ios_inactive_30d','android_active_30d','android_inactive_30d']

def get_bq():
    with open(f"{WORKSPACE}/.gcp/adc.json") as f:
        info = json.load(f)
    creds = Credentials(token=None, refresh_token=info["refresh_token"],
        client_id=info["client_id"], client_secret=info["client_secret"],
        token_uri="https://oauth2.googleapis.com/token")
    creds.refresh(Request())
    return bigquery.Client(credentials=creds, project=BQ_PROJECT)

QUERY_GROUPS = f"""
WITH latest_status AS (
  SELECT member_hk,
    ROW_NUMBER() OVER (PARTITION BY member_hk ORDER BY effective_from DESC) AS rn
  FROM `{BQ_PROJECT}.intermediate.sat__member`
  WHERE status IN ('EMAIL_VERIFIED', 'PHONE_CALL_VERIFIED')
),
member_snapshot AS (
  SELECT ls.member_hk,
    MAX(sa.platform) AS platform,
    MAX(CASE WHEN sa.created_date BETWEEN DATE_SUB('{SNAPSHOT_DATE}', INTERVAL 30 DAY)
                                      AND DATE('{SNAPSHOT_DATE}')
             THEN sa.created_date END) AS last_active_before_snapshot
  FROM `{BQ_PROJECT}.base_marts.base__link__member_session` ls
  JOIN `{BQ_PROJECT}.base_marts.base__sat__session_session_start_activity` sa
    ON ls.session_hk = sa.session_hk
  WHERE sa.platform IN ('IOS','ANDROID')
  GROUP BY ls.member_hk
),
grp_map AS (
  SELECT m.member_hk,
    CASE
      WHEN ms.platform = 'IOS' AND ms.last_active_before_snapshot IS NOT NULL THEN 'ios_active_30d'
      WHEN ms.platform = 'IOS' THEN 'ios_inactive_30d'
      WHEN ms.platform = 'ANDROID' AND ms.last_active_before_snapshot IS NOT NULL THEN 'android_active_30d'
      WHEN ms.platform = 'ANDROID' THEN 'android_inactive_30d'
    END AS grp
  FROM latest_status m
  JOIN member_snapshot ms ON m.member_hk = ms.member_hk
  WHERE m.rn = 1
),
policy_info AS (
  SELECT member_hk,
    MAX(DATE_ADD(CAST(effective_from AS DATE), INTERVAL 180 DAY)) AS expire_date
  FROM `{BQ_PROJECT}.intermediate.ma_sat__member_policy_statement`
  GROUP BY member_hk
),
carrier_info AS (
  SELECT lmc.member_hk, MAX(CAST(c.is_active AS INT64)) AS carrier_valid
  FROM `{BQ_PROJECT}.base_marts.base__link__member_carrier` lmc
  JOIN `{BQ_PROJECT}.intermediate.sat__carrier` c ON lmc.carrier_hk = c.carrier_hk
  GROUP BY lmc.member_hk
),
invoice30 AS (
  SELECT DISTINCT lmi.member_hk
  FROM `{BQ_PROJECT}.base_marts.base__link__member_invoice` lmi
  JOIN `{BQ_PROJECT}.intermediate.sat__invoice` i ON lmi.invoice_hk = i.invoice_hk
  WHERE CAST(i.issued_at AS DATE) >= DATE_SUB(CURRENT_DATE('Asia/Taipei'), INTERVAL 30 DAY)
),
returned AS (
  SELECT DISTINCT ls.member_hk
  FROM `{BQ_PROJECT}.base_marts.base__link__member_session` ls
  JOIN `{BQ_PROJECT}.base_marts.base__sat__session_session_start_activity` sa
    ON ls.session_hk = sa.session_hk
  WHERE sa.created_date > '{SNAPSHOT_DATE}'
),
is_919 AS (
  SELECT DISTINCT lmc.member_hk
  FROM `{BQ_PROJECT}.base_marts.base__link__member_carrier` lmc
  JOIN `{BQ_PROJECT}.intermediate.hub__carrier` hc ON lmc.carrier_hk = hc.carrier_hk
  WHERE hc.barcode LIKE '/%'
)
SELECT g.grp,
  COUNT(DISTINCT g.member_hk) AS total,
  COUNT(DISTINCT r.member_hk) AS returned,
  COUNT(DISTINCT CASE WHEN r.member_hk IS NULL THEN g.member_hk END) AS not_returned,
  COUNT(DISTINCT s919.member_hk) AS is_919,
  COUNT(DISTINCT CASE WHEN p.expire_date IS NULL THEN g.member_hk END) AS policy_never,
  COUNT(DISTINCT CASE WHEN p.expire_date < CURRENT_DATE('Asia/Taipei') THEN g.member_hk END) AS policy_expired,
  COUNT(DISTINCT CASE WHEN p.expire_date >= CURRENT_DATE('Asia/Taipei') THEN g.member_hk END) AS policy_valid,
  COUNT(DISTINCT CASE WHEN c.carrier_valid = 1 THEN g.member_hk END) AS carrier_valid_count,
  COUNT(DISTINCT CASE WHEN c.carrier_valid IS NULL OR c.carrier_valid = 0 THEN g.member_hk END) AS carrier_invalid_count,
  COUNT(DISTINCT inv30.member_hk) AS has_invoice_30d
FROM grp_map g
LEFT JOIN returned r ON g.member_hk = r.member_hk
LEFT JOIN is_919 s919 ON g.member_hk = s919.member_hk
LEFT JOIN policy_info p ON g.member_hk = p.member_hk
LEFT JOIN carrier_info c ON g.member_hk = c.member_hk
LEFT JOIN invoice30 inv30 ON g.member_hk = inv30.member_hk
WHERE g.grp IS NOT NULL
GROUP BY g.grp ORDER BY g.grp
"""

QUERY_TREND = f"""
WITH latest_status AS (
  SELECT member_hk,
    ROW_NUMBER() OVER (PARTITION BY member_hk ORDER BY effective_from DESC) AS rn
  FROM `{BQ_PROJECT}.intermediate.sat__member`
  WHERE status IN ('EMAIL_VERIFIED', 'PHONE_CALL_VERIFIED')
),
member_snapshot AS (
  SELECT ls.member_hk,
    MAX(sa.platform) AS platform,
    MAX(CASE WHEN sa.created_date BETWEEN DATE_SUB('{SNAPSHOT_DATE}', INTERVAL 30 DAY)
                                      AND DATE('{SNAPSHOT_DATE}')
             THEN sa.created_date END) AS last_active_before_snapshot
  FROM `{BQ_PROJECT}.base_marts.base__link__member_session` ls
  JOIN `{BQ_PROJECT}.base_marts.base__sat__session_session_start_activity` sa
    ON ls.session_hk = sa.session_hk
  WHERE sa.platform IN ('IOS','ANDROID')
  GROUP BY ls.member_hk
),
grp_map AS (
  SELECT m.member_hk,
    CASE
      WHEN ms.platform = 'IOS' AND ms.last_active_before_snapshot IS NOT NULL THEN 'ios_active_30d'
      WHEN ms.platform = 'IOS' THEN 'ios_inactive_30d'
      WHEN ms.platform = 'ANDROID' AND ms.last_active_before_snapshot IS NOT NULL THEN 'android_active_30d'
      WHEN ms.platform = 'ANDROID' THEN 'android_inactive_30d'
    END AS grp
  FROM latest_status m
  JOIN member_snapshot ms ON m.member_hk = ms.member_hk
  WHERE m.rn = 1
),
daily_ret AS (
  SELECT ls.member_hk, sa.created_date
  FROM `{BQ_PROJECT}.base_marts.base__link__member_session` ls
  JOIN `{BQ_PROJECT}.base_marts.base__sat__session_session_start_activity` sa
    ON ls.session_hk = sa.session_hk
  WHERE sa.created_date BETWEEN '{TREND_START}' AND CURRENT_DATE('Asia/Taipei')
)
SELECT dr.created_date AS date,
  COUNT(DISTINCT CASE WHEN g.grp = 'ios_active_30d' THEN g.member_hk END) AS ios_active_30d,
  COUNT(DISTINCT CASE WHEN g.grp = 'ios_inactive_30d' THEN g.member_hk END) AS ios_inactive_30d,
  COUNT(DISTINCT CASE WHEN g.grp = 'android_active_30d' THEN g.member_hk END) AS android_active_30d,
  COUNT(DISTINCT CASE WHEN g.grp = 'android_inactive_30d' THEN g.member_hk END) AS android_inactive_30d
FROM daily_ret dr
JOIN grp_map g ON dr.member_hk = g.member_hk
WHERE g.grp IS NOT NULL
GROUP BY dr.created_date ORDER BY dr.created_date
"""

HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>受眾回訪分析 Dashboard</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0F172A;--card:#1E293B;--text:#E2E8F0;--muted:#94A3B8;--border:#334155}
body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;min-height:100vh;padding:24px 16px}
.header{text-align:center;margin-bottom:28px}
.header h1{font-size:clamp(1.2rem,3vw,1.8rem);font-weight:700;background:linear-gradient(135deg,#3B82F6,#60A5FA);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px}
.header .sub{color:var(--muted);font-size:.85rem}
.update-time{color:#64748B;font-size:.78rem;margin-top:4px}
.section-title{font-size:.75rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:24px 0 12px}
.grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:8px}
.kpi-card{background:var(--card);border-radius:12px;padding:16px;border:1px solid var(--border)}
.kpi-label{font-size:.8rem;font-weight:600;margin-bottom:8px}
.kpi-total{font-size:1.8rem;font-weight:800;font-variant-numeric:tabular-nums;margin-bottom:10px}
.kpi-total span{font-size:.9rem;font-weight:400;color:var(--muted)}
.kpi-row{display:flex;justify-content:space-between;align-items:center;font-size:.8rem;margin-bottom:4px}
.kpi-row .pct{color:var(--muted);font-size:.72rem}
.progress-bar{height:5px;background:#1E3A5F;border-radius:99px;overflow:hidden;margin:8px 0 4px}
.progress-fill{height:100%;border-radius:99px;transition:width 1s cubic-bezier(.34,1.56,.64,1)}
.detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
.detail-item{text-align:center}
.detail-item .val{font-size:1rem;font-weight:700;font-variant-numeric:tabular-nums}
.detail-item .lbl{font-size:.68rem;color:var(--muted);margin-top:2px}
.chart-wrap{background:var(--card);border-radius:12px;padding:20px;margin-bottom:8px;border:1px solid var(--border)}
.chart-legend{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px}
.legend-item{display:flex;align-items:center;gap:6px;font-size:.78rem}
.legend-dot{width:10px;height:10px;border-radius:50%}
svg.line-chart{width:100%;height:auto}
.table-wrap{background:var(--card);border-radius:12px;overflow:hidden;border:1px solid var(--border);margin-bottom:8px}
table{width:100%;border-collapse:collapse;font-size:.8rem}
thead tr{background:#1a2744}
th{padding:10px 12px;text-align:right;font-size:.72rem;font-weight:600;color:var(--muted);white-space:nowrap}
th:first-child{text-align:left}
tbody tr{border-top:1px solid var(--border)}
tbody tr:hover{background:rgba(255,255,255,.03)}
td{padding:9px 12px;text-align:right;font-variant-numeric:tabular-nums}
td:first-child{text-align:left;color:var(--muted);font-size:.75rem}
.rate{font-size:.7rem;color:var(--muted)}
.tooltip{position:fixed;background:#1E293B;border:1px solid #334155;border-radius:8px;padding:10px 14px;font-size:.78rem;pointer-events:none;opacity:0;transition:opacity .15s;z-index:999;min-width:160px}
</style>
</head>
<body>
<div class="header">
  <h1>受眾回訪分析 Dashboard</h1>
  <p class="sub">四群用戶自 2026-03-01 起的每日回訪追蹤（快照基準：3/22）</p>
  <p class="update-time">資料更新時間：{update_time}</p>
</div>
<div class="section-title">各群總覽</div>
<div class="grid4" id="kpiGrid"></div>
<div class="section-title">每日回訪人數趨勢（3/1 起）</div>
<div class="chart-wrap">
  <div class="chart-legend" id="chartLegend"></div>
  <svg class="line-chart" id="lineChart" viewBox="0 0 800 320"></svg>
</div>
<div class="section-title">每日回訪人數明細</div>
<div class="table-wrap">
  <table><thead><tr>
    <th>日期</th>
    <th>iOS 活躍<br><span class="rate">回訪人數</span></th>
    <th>iOS 未活躍<br><span class="rate">回訪人數</span></th>
    <th>Android 活躍<br><span class="rate">回訪人數</span></th>
    <th>Android 未活躍<br><span class="rate">回訪人數</span></th>
    <th>合計</th>
  </tr></thead><tbody id="dailyBody"></tbody></table>
</div>
<div class="tooltip" id="tooltip"></div>
<script>
const groups={groups_json};
const trend={trend_json};
const fmt=n=>n>=1e6?(n/1e6).toFixed(2)+\'M\':n>=1e4?(n/1e4).toFixed(1)+\'萬\':n.toLocaleString();
const fmtN=n=>Number(n).toLocaleString();
const pct=(a,b)=>b>0?((a/b)*100).toFixed(1)+\'%\':\'—\';
const kpiGrid=document.getElementById(\'kpiGrid\');
groups.forEach(g=>{{
  const retPct=g.total>0?(g.returned/g.total*100):0;
  const card=document.createElement(\'div\');card.className=\'kpi-card\';
  card.innerHTML=`<div class="kpi-label" style="color:${{g.color}}">${{g.label}}</div>
    <div class="kpi-total">${{fmt(g.total)}}<span> 人</span></div>
    <div class="kpi-row"><span>✅ 已回訪</span><span class="num">${{fmtN(g.returned)}}</span><span class="pct">(${{pct(g.returned,g.total)}})</span></div>
    <div class="kpi-row"><span>⬜ 未回訪</span><span class="num">${{fmtN(g.not_returned)}}</span><span class="pct">(${{pct(g.not_returned,g.total)}})</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:0%;background:${{g.color}}" data-w="${{retPct.toFixed(2)}}"></div></div>
    <div style="font-size:.72rem;color:var(--muted);text-align:right;margin-bottom:8px">回訪率 <strong style="color:#fff">${{retPct.toFixed(1)}}%</strong></div>
    <div class="detail-grid">
      <div class="detail-item"><div class="val" style="color:#F59E0B">${{fmtN(g.is_919)}}</div><div class="lbl">919載具</div></div>
      <div class="detail-item"><div class="val" style="color:#34D399">${{fmtN(g.policy_valid)}}</div><div class="lbl">合規未到期</div></div>
      <div class="detail-item"><div class="val" style="color:#F87171">${{fmtN(g.policy_expired)}}</div><div class="lbl">合規已到期</div></div>
      <div class="detail-item"><div class="val" style="color:#818CF8">${{fmtN(g.has_invoice_30d)}}</div><div class="lbl">近30天有發票</div></div>
    </div>`;
  kpiGrid.appendChild(card);
}});
setTimeout(()=>document.querySelectorAll(\'.progress-fill\').forEach(el=>el.style.width=el.dataset.w+\'%\'),150);
const legend=document.getElementById(\'chartLegend\');
groups.forEach(g=>legend.innerHTML+=`<div class="legend-item"><div class="legend-dot" style="background:${{g.color}}"></div>${{g.label}}</div>`);
function buildChart(){{
  const svg=document.getElementById(\'lineChart\');
  const W=800,H=320,padL=70,padR=20,padT=20,padB=50,cW=W-padL-padR,cH=H-padT-padB;
  const keys=[\'ios_active_30d\',\'ios_inactive_30d\',\'android_active_30d\',\'android_inactive_30d\'];
  const allVals=trend.flatMap(d=>keys.map(k=>d[k]||0));
  const maxV=Math.max(...allVals,1),xStep=cW/Math.max(trend.length-1,1);
  const yScale=v=>padT+cH-(v/maxV)*cH,xScale=i=>padL+i*xStep;
  let s=\'\';
  for(let i=0;i<=4;i++){{const v=maxV/4*i,y=yScale(v);s+=`<line x1="${{padL}}" y1="${{y}}" x2="${{W-padR}}" y2="${{y}}" stroke="#334155" stroke-width="1" stroke-dasharray="4,4"/><text x="${{padL-6}}" y="${{y+4}}" fill="#64748B" font-size="11" text-anchor="end">${{v>=1e4?(v/1e4).toFixed(0)+\'萬\':v.toFixed(0)}}</text>`;}}
  trend.forEach((d,i)=>{{const x=xScale(i),lbl=d.date.slice(5).replace(\'-\',\'/\');s+=`<text x="${{x}}" y="${{H-padB+20}}" fill="#64748B" font-size="11" text-anchor="middle">${{lbl}}</text><line x1="${{x}}" y1="${{padT}}" x2="${{x}}" y2="${{H-padB}}" stroke="#334155" stroke-width="0.5"/>`;}} );
  groups.forEach(g=>{{
    const pts=trend.map((d,i)=>`${{xScale(i)}},${{yScale(d[g.group_name]||0)}}`).join(\' \');
    s+=`<polyline points="${{pts}}" fill="none" stroke="${{g.color}}" stroke-width="2.5" stroke-linejoin="round"/>`;
    trend.forEach((d,i)=>s+=`<circle cx="${{xScale(i)}}" cy="${{yScale(d[g.group_name]||0)}}" r="4" fill="${{g.color}}" stroke="#1E293B" stroke-width="2" style="cursor:pointer" data-date="${{d.date}}" data-group="${{g.group_name}}" data-val="${{d[g.group_name]||0}}"/>`);
  }});
  svg.innerHTML=s;
  const tooltip=document.getElementById(\'tooltip\');
  svg.querySelectorAll(\'circle\').forEach(dot=>{{
    dot.addEventListener(\'mousemove\',e=>{{const grp=groups.find(g=>g.group_name===dot.dataset.group);tooltip.innerHTML=`<div style="color:${{grp?.color}}">${{grp?.label}}</div><div>${{dot.dataset.date}}</div><div style="font-size:1rem;font-weight:700">${{Number(dot.dataset.val).toLocaleString()}} 人</div>`;tooltip.style.opacity=\'1\';tooltip.style.left=(e.clientX+12)+\'px\';tooltip.style.top=(e.clientY-40)+\'px\';}});
    dot.addEventListener(\'mouseleave\',()=>tooltip.style.opacity=\'0\');
  }});
}}
buildChart();
const tbody=document.getElementById(\'dailyBody\');
const totals={{ios_active_30d:0,ios_inactive_30d:0,android_active_30d:0,android_inactive_30d:0}};
[...trend].reverse().forEach(d=>{{
  const tot=(d.ios_active_30d||0)+(d.ios_inactive_30d||0)+(d.android_active_30d||0)+(d.android_inactive_30d||0);
  [\'ios_active_30d\',\'ios_inactive_30d\',\'android_active_30d\',\'android_inactive_30d\'].forEach(k=>totals[k]+=(d[k]||0));
  const row=document.createElement(\'tr\');
  row.innerHTML=`<td>${{d.date}}</td><td>${{(d.ios_active_30d||0).toLocaleString()}}</td><td>${{(d.ios_inactive_30d||0).toLocaleString()}}</td><td>${{(d.android_active_30d||0).toLocaleString()}}</td><td>${{(d.android_inactive_30d||0).toLocaleString()}}</td><td style="font-weight:700">${{tot.toLocaleString()}}</td>`;
  tbody.appendChild(row);
}});
const totRow=document.createElement(\'tr\');totRow.style.background=\'#1a2744\';totRow.style.fontWeight=\'700\';
const totAll=Object.values(totals).reduce((s,v)=>s+v,0);
totRow.innerHTML=`<td style="color:var(--text)">累計合計</td><td>${{totals.ios_active_30d.toLocaleString()}}</td><td>${{totals.ios_inactive_30d.toLocaleString()}}</td><td>${{totals.android_active_30d.toLocaleString()}}</td><td>${{totals.android_inactive_30d.toLocaleString()}}</td><td style="color:#60A5FA">${{totAll.toLocaleString()}}</td>`;
tbody.appendChild(totRow);
</script>
</body>
</html>'''

def build_html(groups_data, trend_data, update_time):
    gmap = {g['grp']: g for g in groups_data}
    groups_js = []
    for grp in ORDER:
        g = gmap.get(grp, {})
        groups_js.append({
            "group_name": grp, "label": LABELS[grp], "color": COLORS[grp],
            "total": int(g.get('total', 0)), "returned": int(g.get('returned', 0)),
            "not_returned": int(g.get('not_returned', 0)),
            "is_919": int(g.get('is_919', 0)),
            "policy_never": int(g.get('policy_never', 0)),
            "policy_expired": int(g.get('policy_expired', 0)),
            "policy_valid": int(g.get('policy_valid', 0)),
            "carrier_valid": int(g.get('carrier_valid_count', 0)),
            "carrier_invalid": int(g.get('carrier_invalid_count', 0)),
            "has_invoice_30d": int(g.get('has_invoice_30d', 0)),
        })
    trend_js = [{**{k: int(v) if k != 'date' else v for k, v in d.items()}} for d in trend_data]
    html = HTML_TEMPLATE.replace('{groups_json}', json.dumps(groups_js, ensure_ascii=False))
    html = html.replace('{trend_json}', json.dumps(trend_js, ensure_ascii=False))
    html = html.replace('{update_time}', update_time)
    return html

def main():
    print("📡 連接 BigQuery...")
    bq = get_bq()
    update_time = datetime.now().strftime('%Y-%m-%d %H:%M (Asia/Taipei)')

    print("撈取四群總覽資料...")
    rows_g = list(bq.query(QUERY_GROUPS).result())
    print(f"✅ 群組: {len(rows_g)} 筆")

    print("撈取每日回訪趨勢...")
    rows_t = list(bq.query(QUERY_TREND).result())
    print(f"✅ 趨勢: {len(rows_t)} 天")

    print("建立 HTML...")
    groups_data = [dict(r) for r in rows_g]
    trend_data = [{**dict(r), 'date': str(r['date'])} for r in rows_t]
    html = build_html(groups_data, trend_data, update_time)

    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"✅ HTML 更新: {REPORT_PATH}")

    print("推送到 GitHub...")
    os.chdir(WORKSPACE)
    subprocess.run(["git", "add", "docs/audience_dashboard.html"], check=True)
    subprocess.run(["git", "commit", "-m", f"chore: 每日更新 audience dashboard ({update_time[:10]})"], check=True)
    subprocess.run(["git", "push"], check=True)
    print(f"✅ 完成！{update_time}")

if __name__ == '__main__':
    main()
