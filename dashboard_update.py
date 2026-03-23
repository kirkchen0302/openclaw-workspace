#!/usr/bin/env python3
"""
用戶行為分析 Dashboard 每日更新腳本
Google Sheets: https://docs.google.com/spreadsheets/d/1AumL4ETIGULaEpOArkujpG5EzPOwDpnBsfXu5hQBXHc/edit
"""

import json, requests, sys
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google.cloud import bigquery
from datetime import datetime, timezone, timedelta

SHEET_ID = '1AumL4ETIGULaEpOArkujpG5EzPOwDpnBsfXu5hQBXHc'
BQ_PROJECT = 'production-379804'

def get_bq_client():
    with open("/Users/kirk/.openclaw/workspace/.gcp/adc.json") as f:
        info = json.load(f)
    creds = Credentials(token=None, refresh_token=info["refresh_token"],
        client_id=info["client_id"], client_secret=info["client_secret"],
        token_uri="https://oauth2.googleapis.com/token")
    creds.refresh(Request())
    return bigquery.Client(credentials=creds, project=BQ_PROJECT)

def get_sheets_headers():
    with open('/Users/kirk/.openclaw/workspace/.gcp/google_workspace_token.json') as f:
        info = json.load(f)
    resp = requests.post('https://oauth2.googleapis.com/token', data={
        'refresh_token': info['refresh_token'],
        'client_id': info['client_id'],
        'client_secret': info['client_secret'],
        'grant_type': 'refresh_token'
    })
    token = resp.json()['access_token']
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

def write_sheet(headers, range_name, values):
    requests.put(
        f'https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{range_name}',
        headers=headers,
        params={'valueInputOption': 'USER_ENTERED'},
        json={'values': values}
    )

def main():
    print("📡 連接 BigQuery...")
    bq = get_bq_client()
    ws_headers = get_sheets_headers()
    today = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d')

    # ── 1. Policy 到期用戶行為軌跡 ──
    print("🔄 更新 Policy 到期行為...")
    rows = list(bq.query("""
        WITH expired AS (
            SELECT DISTINCT m.member_hk FROM (
                SELECT member_hk, status,
                    ROW_NUMBER() OVER (PARTITION BY member_hk ORDER BY effective_from DESC) as rn
                FROM intermediate.sat__member
            ) m
            LEFT JOIN (
                SELECT member_hk,
                    DATE_ADD(MAX(CAST(effective_from AS DATE)), INTERVAL 180 DAY) as expire_date
                FROM intermediate.ma_sat__member_policy_statement GROUP BY member_hk
            ) p ON m.member_hk = p.member_hk
            WHERE m.rn=1 AND m.status IN ('EMAIL_VERIFIED','PHONE_CALL_VERIFIED')
              AND p.expire_date < CURRENT_DATE()
              AND p.expire_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        ),
        lp AS (
            SELECT ls.member_hk, pv.page,
                ROW_NUMBER() OVER (PARTITION BY ls.member_hk ORDER BY pv.created_date DESC) as rn
            FROM base_marts.base__link__member_session ls
            JOIN base_marts.base__sat__session_pageview_activity pv ON ls.session_hk = pv.session_hk
            WHERE pv.created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        )
        SELECT lp.page, COUNT(DISTINCT e.member_hk) as user_count,
            ROUND(COUNT(DISTINCT e.member_hk)/(SELECT COUNT(*) FROM expired)*100,2) as pct
        FROM expired e JOIN lp ON e.member_hk=lp.member_hk AND lp.rn=1
        GROUP BY lp.page ORDER BY user_count DESC LIMIT 15
    """).result())
    data = [[f'🔄 Policy 到期用戶行為軌跡 | 更新：{today}','',''],
            ['最後使用頁面','用戶數','佔比(%)']]
    data += [[r['page'], r['user_count'], r['pct']] for r in rows]
    write_sheet(ws_headers, "'🔄 Policy到期行為'!A1", data)

    # ── 2. 新用戶漏斗 ──
    print("📈 更新新用戶漏斗...")
    r = list(bq.query("""
        WITH nm AS (
            SELECT DISTINCT member_hk FROM intermediate.sat__member
            WHERE CAST(created_at AS DATE) >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        ),
        cb AS (SELECT DISTINCT lc.member_hk FROM base_marts.base__link__member_carrier lc JOIN nm ON lc.member_hk=nm.member_hk),
        ca AS (
            SELECT DISTINCT lc.member_hk FROM base_marts.base__link__member_carrier lc
            JOIN intermediate.sat__carrier c ON lc.carrier_hk=c.carrier_hk
            JOIN nm ON lc.member_hk=nm.member_hk WHERE c.is_active=true
        ),
        pa AS (SELECT DISTINCT p.member_hk FROM intermediate.ma_sat__member_policy_statement p JOIN nm ON p.member_hk=nm.member_hk),
        a30 AS (
            SELECT DISTINCT ls.member_hk FROM base_marts.base__link__member_session ls
            JOIN base_marts.base__sat__session_session_start_activity sa ON ls.session_hk=sa.session_hk
            JOIN nm ON ls.member_hk=nm.member_hk
            WHERE sa.created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        )
        SELECT COUNT(DISTINCT nm.member_hk) s1, COUNT(DISTINCT cb.member_hk) s2,
               COUNT(DISTINCT ca.member_hk) s3, COUNT(DISTINCT pa.member_hk) s4,
               COUNT(DISTINCT a30.member_hk) s5
        FROM nm LEFT JOIN cb ON nm.member_hk=cb.member_hk LEFT JOIN ca ON nm.member_hk=ca.member_hk
        LEFT JOIN pa ON nm.member_hk=pa.member_hk LEFT JOIN a30 ON nm.member_hk=a30.member_hk
    """).result())[0]
    base = r['s1']
    data2 = [
        [f'📈 新用戶漏斗分析（近90天）| 更新：{today}','','',''],
        ['步驟','人數','佔總%','前步轉換%'],
        ['1. 註冊', r['s1'], 100.0, '-'],
        ['2. 載具綁定', r['s2'], round(r['s2']/base*100,1), round(r['s2']/r['s1']*100,1)],
        ['3. 載具有效', r['s3'], round(r['s3']/base*100,1), round(r['s3']/r['s2']*100,1)],
        ['4. Policy授權', r['s4'], round(r['s4']/base*100,1), round(r['s4']/r['s3']*100,1)],
        ['5. 30天活躍', r['s5'], round(r['s5']/base*100,1), round(r['s5']/r['s4']*100,1)],
    ]
    write_sheet(ws_headers, "'📈 新用戶漏斗'!A1", data2)

    # ── 3. 沉睡用戶分析 ──
    print("🎯 更新沉睡用戶分析...")
    rows3 = list(bq.query("""
        WITH am AS (
            SELECT member_hk FROM (
                SELECT member_hk, status,
                    ROW_NUMBER() OVER (PARTITION BY member_hk ORDER BY effective_from DESC) as rn
                FROM intermediate.sat__member
            ) WHERE rn=1 AND status IN ('EMAIL_VERIFIED','PHONE_CALL_VERIFIED')
        ),
        ls AS (
            SELECT ls.member_hk, MAX(sa.created_date) as last_date
            FROM base_marts.base__link__member_session ls
            JOIN base_marts.base__sat__session_session_start_activity sa ON ls.session_hk=sa.session_hk
            GROUP BY ls.member_hk
        )
        SELECT CASE
            WHEN DATE_DIFF(CURRENT_DATE(), ls.last_date, DAY) < 30 THEN '活躍(30天內)'
            WHEN DATE_DIFF(CURRENT_DATE(), ls.last_date, DAY) BETWEEN 30 AND 59 THEN '30-59天未開啟'
            WHEN DATE_DIFF(CURRENT_DATE(), ls.last_date, DAY) BETWEEN 60 AND 89 THEN '60-89天未開啟'
            WHEN DATE_DIFF(CURRENT_DATE(), ls.last_date, DAY) BETWEEN 90 AND 179 THEN '90-179天未開啟'
            WHEN DATE_DIFF(CURRENT_DATE(), ls.last_date, DAY) >= 180 THEN '180天以上未開啟'
            ELSE '從未開啟'
        END as segment, COUNT(DISTINCT am.member_hk) as cnt
        FROM am LEFT JOIN ls ON am.member_hk=ls.member_hk
        GROUP BY segment ORDER BY cnt DESC
    """).result())
    total = sum(r['cnt'] for r in rows3)
    data3 = [[f'🎯 沉睡用戶分析 | 更新：{today}','',''],['分層','人數','佔比(%)']]
    data3 += [[r['segment'], r['cnt'], round(r['cnt']/total*100,1)] for r in rows3]
    write_sheet(ws_headers, "'🎯 沉睡用戶分析'!A1", data3)

    # ── 4. 每日指標 ──
    print("📊 更新每日指標...")
    rows4 = list(bq.query("""
        SELECT effective_from,
            COUNTIF(is_member_active) as active_members,
            COUNTIF(is_carrier_active) as carrier_active,
            COUNTIF(is_policy_active) as policy_active,
            COUNTIF(is_invoice_active_30d) as invoice_30d,
            COUNTIF(is_member_active AND is_carrier_active AND is_policy_active) as mavs,
            COUNTIF(is_member_active AND is_carrier_active) as hyvs,
            ROUND(COUNTIF(is_carrier_active)/COUNTIF(is_member_active)*100,2) as carrier_rate,
            ROUND(COUNTIF(is_policy_active)/COUNTIF(is_member_active)*100,2) as policy_rate,
            ROUND(COUNTIF(is_invoice_active_30d)/COUNTIF(is_member_active)*100,2) as invoice_rate
        FROM base_marts.base__computed_sat__verified_syncer
        WHERE effective_from >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        GROUP BY effective_from ORDER BY effective_from DESC
    """).result())
    data4 = [
        [f'📊 每日指標趨勢（近30天）| 更新：{today}','','','','','','','','',''],
        ['日期','活躍會員','載具有效','Policy有效','30天發票','MAVS','HYVS','載具率%','Policy率%','發票率%'],
    ]
    data4 += [[str(r['effective_from']), r['active_members'], r['carrier_active'],
               r['policy_active'], r['invoice_30d'], r['mavs'], r['hyvs'],
               r['carrier_rate'], r['policy_rate'], r['invoice_rate']] for r in rows4]
    write_sheet(ws_headers, "'📊 每日指標'!A1", data4)

    print(f"\n✅ Dashboard 更新完成！{today}")
    print(f"🔗 https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit")
    print(f"__SHEET_URL__:https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit")

if __name__ == '__main__':
    main()
