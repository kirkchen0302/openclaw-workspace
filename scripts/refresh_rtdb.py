#!/usr/bin/env python3
"""Refresh RTDB test users with items + issued_at from BQ (12 months)."""
import json, ssl, base64
from collections import defaultdict
from pathlib import Path
from urllib.request import Request, urlopen

import google.auth
from google.auth.transport.requests import Request as AuthRequest
from google.cloud import bigquery
from google.oauth2.service_account import Credentials as SACredentials

RTDB_URL = 'https://pm-prototype-a75ce-default-rtdb.asia-southeast1.firebasedatabase.app'
BQ_PROJECT = 'production-379804'
SA_JSON = Path('/Users/kirk.chen/Downloads/pm-prototype-a75ce-firebase-adminsdk-fbsvc-3f1deaaadf.json')
CLASSIFICATION_JSON = Path('/Users/kirk.chen/Projects/invoice-prototype-repo/invoice-prototype/src/data/shop_classification.json')
WEEKDAY_MAP = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

def get_bq_client():
    creds, _ = google.auth.default()
    return bigquery.Client(credentials=creds, project=BQ_PROJECT)

def get_rtdb_token():
    creds = SACredentials.from_service_account_file(str(SA_JSON), scopes=[
        'https://www.googleapis.com/auth/firebase.database',
        'https://www.googleapis.com/auth/userinfo.email',
    ])
    creds.refresh(AuthRequest())
    return creds.token

def rtdb_put(path, payload, token):
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = Request(f'{RTDB_URL}/{path}.json', data=data, method='PUT',
                  headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'})
    ctx = ssl._create_unverified_context()
    with urlopen(req, context=ctx, timeout=120) as resp:
        return resp.status

def rtdb_get(path):
    ctx = ssl._create_unverified_context()
    with urlopen(f'{RTDB_URL}/{path}.json', context=ctx, timeout=60) as resp:
        return json.loads(resp.read().decode('utf-8'))

def load_classification():
    rows = json.loads(CLASSIFICATION_JSON.read_text())
    return {(r.get('shop') or '').strip(): r for r in rows if r.get('shop')}

# ── BQ Queries ────────────────────────────────────────────────────────────

def fetch_invoices(client, phones):
    phone_list = ','.join(f"'{p}'" for p in phones)
    q = f'''
    WITH members AS (
      SELECT h.member_hk, s.phone_number,
             ROW_NUMBER() OVER (PARTITION BY h.member_hk ORDER BY s.effective_from DESC) AS rn
      FROM `{BQ_PROJECT}.intermediate.hub__member` h
      JOIN `{BQ_PROJECT}.intermediate.sat__member` s USING(member_hk)
      WHERE s.phone_number IN ({phone_list})
    ), inv AS (
      SELECT m.phone_number, hi.invoice_hk, hi.invoice_number,
             si.issued_at, CAST(si.issued_at AS DATE) AS issued_date,
             CAST(ROUND(si.total_price) AS INT64) AS amount,
             ss.name AS seller_name
      FROM members m
      JOIN `{BQ_PROJECT}.base_marts.base__link__member_invoice` lmi USING(member_hk)
      JOIN `{BQ_PROJECT}.intermediate.hub__invoice` hi USING(invoice_hk)
      JOIN `{BQ_PROJECT}.intermediate.sat__invoice` si USING(invoice_hk)
      LEFT JOIN `{BQ_PROJECT}.intermediate.link__seller_invoice` lsi USING(invoice_hk)
      LEFT JOIN (
        SELECT seller_hk, name, ROW_NUMBER() OVER (PARTITION BY seller_hk ORDER BY effective_from DESC) AS rn
        FROM `{BQ_PROJECT}.intermediate.sat__seller`
      ) ss ON lsi.seller_hk = ss.seller_hk AND ss.rn = 1
      WHERE m.rn = 1
        AND CAST(si.issued_at AS DATE) >= DATE_SUB(CURRENT_DATE('Asia/Taipei'), INTERVAL 12 MONTH)
        AND si.total_price > 0
      QUALIFY ROW_NUMBER() OVER (PARTITION BY hi.invoice_hk ORDER BY si.effective_from DESC) = 1
    )
    SELECT * FROM inv ORDER BY phone_number, issued_date DESC
    '''
    return list(client.query(q).result())

def fetch_items(client, invoice_hks_b64):
    """Fetch items for invoices. invoice_hks_b64 is list of base64-encoded hk strings."""
    if not invoice_hks_b64:
        return {}
    items = defaultdict(list)
    for i in range(0, len(invoice_hks_b64), 500):
        batch = invoice_hks_b64[i:i+500]
        hk_sql = ','.join(f"FROM_BASE64('{h}')" for h in batch)
        q = f'''
        SELECT lii.invoice_hk,
               sit.item_name, CAST(ROUND(sit.item_price) AS INT64) AS item_price,
               CAST(sit.item_quantity AS INT64) AS item_qty
        FROM `{BQ_PROJECT}.intermediate.link__invoice_invoice_item` lii
        JOIN `{BQ_PROJECT}.intermediate.sat__invoice_item` sit ON lii.invoice_item_hk = sit.invoice_item_hk
        WHERE lii.invoice_hk IN ({hk_sql})
        '''
        for row in client.query(q).result():
            hk_bytes = row['invoice_hk']
            items[hk_bytes].append({
                'name': row['item_name'] or '',
                'price': int(row['item_price'] or 0),
                'qty': int(row['item_qty'] or 1),
            })
    return dict(items)

# ── Build Payload ─────────────────────────────────────────────────────────

def build_payload(inv_rows, items_by_hk, classification):
    invoices = []
    total = 0
    month_amounts = defaultdict(int)

    for r in inv_rows:
        seller = r['seller_name'] or '未知通路'
        meta = classification.get(seller, {})
        brand = (meta.get('brand') or '').strip() or seller
        cat = (meta.get('category_lv1') or '').strip() or '其他'
        amt = int(r['amount'] or 0)
        issued_date = r['issued_date']
        issued_at = r['issued_at']
        ym = issued_date.strftime('%Y-%m')

        # Format issued_at
        issued_at_str = issued_at.isoformat() if hasattr(issued_at, 'isoformat') else str(issued_at)

        # Get items
        hk = r['invoice_hk']
        inv_items = items_by_hk.get(hk, [])

        inv = {
            'amount': amt,
            'shop': brand,
            'yearMonth': ym,
            'week': WEEKDAY_MAP[issued_date.weekday()],
            'day': f'{issued_date.day:02d}',
            'issued_at': issued_at_str,
            'rawShop': seller,
            'category_lv1': cat,
        }
        if inv_items:
            inv['items'] = inv_items

        invoices.append(inv)
        total += amt
        month_amounts[ym] += amt

    month_keys = sorted(month_amounts.keys())[-12:]
    monthly_trend = [{'month': k.split('-')[1] + '月', 'amount': month_amounts[k]} for k in month_keys]
    total_items = sum(len(inv.get('items', [])) for inv in invoices)

    return {
        'invoiceCount': len(invoices),
        'invoiceCount_v2': len(invoices),
        'itemCount_v2': total_items,
        'invoices': invoices,
        'invoices_v2': invoices,
        'totalAmount': total,
        'totalAmount_v2': total,
        'monthlyTrend': monthly_trend,
    }

# ── Main ──────────────────────────────────────────────────────────────────

def main():
    classification = load_classification()
    users = rtdb_get('users') or {}
    phones = sorted(users.keys())
    print(f'Test users: {len(phones)} → {phones}')

    client = get_bq_client()

    print('Fetching invoices from BQ (12 months)...')
    rows = fetch_invoices(client, phones)
    print(f'  Got {len(rows)} invoice rows')

    # Group by phone
    grouped = defaultdict(list)
    for r in rows:
        grouped[r['phone_number']].append(r)

    # Collect unique invoice_hk for item fetching
    all_hks = {}
    for r in rows:
        hk = r['invoice_hk']
        if hk and hk not in all_hks:
            all_hks[hk] = base64.b64encode(hk).decode('utf-8') if isinstance(hk, bytes) else str(hk)

    print(f'Fetching items for {len(all_hks)} invoices...')
    items_by_hk = fetch_items(client, list(all_hks.values()))
    print(f'  Got items for {len(items_by_hk)} invoices')

    # Re-key items_by_hk to match original hk objects
    # (BQ returns bytes both times, so keys should match)

    token = get_rtdb_token()
    for phone in phones:
        phone_rows = grouped.get(phone, [])
        payload = build_payload(phone_rows, items_by_hk, classification)

        # Merge with existing user data (keep other fields)
        existing = users.get(phone) or {}
        existing.update(payload)

        rtdb_put(f'users/{phone}', existing, token)
        items_count = payload['itemCount_v2']
        print(f'  {phone}: {payload["invoiceCount"]} invoices, {items_count} items, ${payload["totalAmount"]:,}')

    print(f'Done! Updated {len(phones)} users.')

if __name__ == '__main__':
    main()
