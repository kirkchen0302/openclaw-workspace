#!/usr/bin/env python3
import argparse
import json
import ssl
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from urllib.request import Request as UrlRequest, urlopen

from google.auth.transport.requests import Request
from google.cloud import bigquery
from google.oauth2.credentials import Credentials
from google.oauth2.service_account import Credentials as ServiceAccountCredentials

WORKSPACE = Path('/Users/kirk/.openclaw/workspace')
RTDB_URL = 'https://pm-prototype-a75ce-default-rtdb.asia-southeast1.firebasedatabase.app'
BQ_PROJECT = 'production-379804'
CLASSIFICATION_JSON = WORKSPACE / 'invoice-prototype' / 'src' / 'data' / 'shop_classification.json'
SERVICE_ACCOUNT_JSON = Path('/Users/kirk/.openclaw/media/inbound/pm-prototype-a75ce-firebase-adminsdk-fbsvc-3f1deaaadf---ffa65a02-72bb-4e8c-a4c3-1b8957737228.json')

PIE_COLORS = ['#378ADD', '#639922', '#7F77DD', '#BA7517', '#D85A30', '#8E8E93']
WEEKDAY_MAP = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']


def get_bq_client():
    info = json.loads((WORKSPACE / '.gcp' / 'adc.json').read_text())
    creds = Credentials(
        token=None,
        refresh_token=info['refresh_token'],
        client_id=info['client_id'],
        client_secret=info['client_secret'],
        token_uri='https://oauth2.googleapis.com/token',
    )
    creds.refresh(Request())
    return bigquery.Client(credentials=creds, project=BQ_PROJECT)


def get_rtdb_token():
    creds = ServiceAccountCredentials.from_service_account_file(
        str(SERVICE_ACCOUNT_JSON),
        scopes=[
            'https://www.googleapis.com/auth/firebase.database',
            'https://www.googleapis.com/auth/userinfo.email',
        ],
    )
    creds.refresh(Request())
    return creds.token


def rtdb_get(path: str):
    ctx = ssl._create_unverified_context()
    with urlopen(f'{RTDB_URL}/{path}.json', context=ctx, timeout=60) as resp:
        return json.loads(resp.read().decode('utf-8'))


def rtdb_put(path: str, payload, token: str):
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = UrlRequest(
        f'{RTDB_URL}/{path}.json',
        data=data,
        method='PUT',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}',
        },
    )
    ctx = ssl._create_unverified_context()
    with urlopen(req, context=ctx, timeout=120) as resp:
        return resp.read().decode('utf-8')


def load_classification():
    rows = json.loads(CLASSIFICATION_JSON.read_text())
    mapping = {}
    for row in rows:
        shop = (row.get('shop') or '').strip()
        if not shop:
            continue
        mapping[shop] = row
    return mapping


def fetch_current_test_users():
    users = rtdb_get('users') or {}
    return users


def fetch_invoices_for_phones(client, phones):
    phone_literals = ','.join(f"'{p}'" for p in phones)
    q = f'''
    WITH target_members AS (
      SELECT h.member_hk, h.member_id, s.phone_number,
             ROW_NUMBER() OVER (PARTITION BY h.member_hk ORDER BY s.effective_from DESC) AS rn
      FROM `{BQ_PROJECT}.intermediate.hub__member` h
      JOIN `{BQ_PROJECT}.intermediate.sat__member` s USING(member_hk)
      WHERE s.phone_number IN ({phone_literals})
    ), latest_target AS (
      SELECT member_hk, member_id, phone_number
      FROM target_members
      WHERE rn = 1
    ), invoices AS (
      SELECT lt.phone_number,
             lt.member_id,
             hi.invoice_number,
             hi.period,
             CAST(si.issued_at AS DATE) AS issued_date,
             CAST(si.total_price AS INT64) AS amount,
             ss.name AS seller_name,
             ROW_NUMBER() OVER (PARTITION BY hi.invoice_hk ORDER BY si.effective_from DESC) AS rn_invoice,
             ROW_NUMBER() OVER (PARTITION BY hi.invoice_hk ORDER BY ss.effective_from DESC) AS rn_seller
      FROM latest_target lt
      JOIN `{BQ_PROJECT}.base_marts.base__link__member_invoice` lmi USING(member_hk)
      JOIN `{BQ_PROJECT}.intermediate.hub__invoice` hi USING(invoice_hk)
      JOIN `{BQ_PROJECT}.intermediate.sat__invoice` si USING(invoice_hk)
      LEFT JOIN `{BQ_PROJECT}.intermediate.link__seller_invoice` lsi USING(invoice_hk)
      LEFT JOIN `{BQ_PROJECT}.intermediate.sat__seller` ss USING(seller_hk)
      WHERE CAST(si.issued_at AS DATE) >= DATE_SUB(CURRENT_DATE('Asia/Taipei'), INTERVAL 6 MONTH)
    )
    SELECT phone_number, member_id, invoice_number, period, issued_date, amount,
           COALESCE(seller_name, '未知通路') AS seller_name
    FROM invoices
    WHERE rn_invoice = 1 AND rn_seller = 1
    ORDER BY phone_number, issued_date DESC, invoice_number DESC
    '''
    return list(client.query(q).result())


def month_label(ym: str):
    y, m = ym.split('-')
    return f'{int(m):02d}月'


def build_user_payload(rows, classification):
    invoices = []
    total_amount = 0
    category_amount = defaultdict(int)
    month_amount = defaultdict(int)

    for r in rows:
        issued = r['issued_date']
        seller_name = r['seller_name'] or '未知通路'
        meta = classification.get(seller_name, {})
        brand = (meta.get('brand') or '').strip() or seller_name
        category_lv1 = (meta.get('category_lv1') or '').strip() or '其他'
        amount = int(r['amount'] or 0)
        ym = issued.strftime('%Y-%m')
        invoices.append({
            'amount': amount,
            'day': f'{issued.day:02d}',
            'week': WEEKDAY_MAP[issued.weekday()],
            'shop': brand,
            'highlight': amount >= 10000,
            'yearMonth': ym,
            'invoiceNumber': r['invoice_number'],
            'issuedDate': issued.isoformat(),
            'category_lv1': category_lv1,
            'rawShop': seller_name,
        })
        total_amount += amount
        category_amount[category_lv1] += amount
        month_amount[ym] += amount

    month_keys = sorted(month_amount.keys())[-6:]
    monthly_trend = [{
        'month': month_label(k),
        'amount': month_amount[k],
    } for k in month_keys]

    top_categories = sorted(category_amount.items(), key=lambda kv: kv[1], reverse=True)
    pie_rows = []
    other_pct = 100
    total = total_amount or 1
    for idx, (cat, amt) in enumerate(top_categories[:5]):
        pct = round(amt / total * 100)
        pie_rows.append({'label': cat, 'pct': pct, 'color': PIE_COLORS[idx % len(PIE_COLORS)]})
        other_pct -= pct
    if top_categories[5:] and other_pct > 0:
        pie_rows.append({'label': '其他', 'pct': other_pct, 'color': PIE_COLORS[-1]})
    elif not pie_rows:
        pie_rows = [{'label': '其他', 'pct': 100, 'color': PIE_COLORS[-1]}]

    return {
        'invoiceCount': len(invoices),
        'invoiceCount_v2': len(invoices),
        'itemCount_v2': len(invoices),
        'invoices': invoices,
        'invoices_v2': invoices,
        'totalAmount': total_amount,
        'totalAmount_v2': total_amount,
        'monthlyTrend': monthly_trend,
        'pieData': pie_rows,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()

    classification = load_classification()
    current_users = fetch_current_test_users()
    phones = sorted(current_users.keys())
    if args.limit:
        phones = phones[:args.limit]
    print(f'test users: {len(phones)}')

    client = get_bq_client()
    rows = fetch_invoices_for_phones(client, phones)
    grouped = defaultdict(list)
    member_ids = {}
    for r in rows:
        grouped[r['phone_number']].append(dict(r))
        member_ids[r['phone_number']] = r['member_id']

    token = None if args.dry_run else get_rtdb_token()
    updated = 0
    for phone in phones:
        payload = build_user_payload(grouped.get(phone, []), classification)
        merged = dict(current_users.get(phone) or {})
        merged.update(payload)
        merged['memberId'] = member_ids.get(phone)
        if args.dry_run:
            print(phone, merged.get('invoiceCount'), merged.get('totalAmount'))
        else:
            rtdb_put(f'users/{phone}', merged, token)
            print('updated', phone, merged.get('invoiceCount'), merged.get('totalAmount'))
        updated += 1
    print('done', updated)


if __name__ == '__main__':
    main()
