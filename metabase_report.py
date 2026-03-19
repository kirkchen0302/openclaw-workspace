#!/usr/bin/env python3
"""
Metabase Daily Report - User Overview: Verified Syncer
每日自動撈取報表、生成圖表、AI 分析，傳送到 Telegram
"""

import json
import os
import sys
import requests
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timedelta
from pathlib import Path

# ── 設定 ──────────────────────────────────────────────
METABASE_URL = "https://n-metabase.invos.com.tw"
METABASE_TOKEN = "80c93405-7ca2-434a-96f3-7ee3c8626be5"
CARD_ID = 381
START_DATE = "2025-01-01"
OUTPUT_DIR = Path("/Users/kirk/.openclaw/workspace/reports")
OUTPUT_DIR.mkdir(exist_ok=True)

NOTION_TOKEN = "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"
NOTION_REPORT_PAGE_ID = "327361883e5c81a5b6ccf64afe622921"  # 📊 每日報表

plt.rcParams['font.family'] = ['Arial Unicode MS', 'Heiti TC', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False

# ── 撈取資料 ──────────────────────────────────────────
def fetch_data():
    resp = requests.post(
        f"{METABASE_URL}/api/card/{CARD_ID}/query/json",
        headers={
            "X-Metabase-Session": METABASE_TOKEN,
            "Content-Type": "application/json"
        },
        json={
            "parameters": [
                {
                    "type": "date/single",
                    "target": ["variable", ["template-tag", "start_date"]],
                    "value": START_DATE
                }
            ]
        },
        timeout=30
    )
    resp.raise_for_status()
    return resp.json()

# ── 生成圖表 ──────────────────────────────────────────
def generate_charts(df):
    df['日期'] = pd.to_datetime(df['日期'])
    df = df.sort_values('日期')
    recent = df.tail(30).copy()
    today_str = datetime.now().strftime('%Y%m%d')
    chart_path = OUTPUT_DIR / f"report_{today_str}.png"

    fig = plt.figure(figsize=(18, 20))
    fig.patch.set_facecolor('#F8F9FA')
    latest = recent.iloc[-1]
    fig.suptitle(
        f'User Overview: Verified Syncer  |  {latest["日期"].strftime("%Y-%m-%d")} 報表',
        fontsize=16, fontweight='bold', y=0.98, color='#1A1A2E'
    )

    gs = fig.add_gridspec(4, 3, hspace=0.45, wspace=0.35,
                          left=0.06, right=0.97, top=0.94, bottom=0.04)

    def fmt_ax(ax, title):
        ax.set_title(title, fontsize=11, fontweight='bold', color='#1A1A2E', pad=8)
        ax.set_facecolor('#FFFFFF')
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%m/%d'))
        ax.tick_params(axis='x', rotation=45, labelsize=8)
        ax.tick_params(axis='y', labelsize=8)

    # ── 頂部 KPI 卡片（3格） ─────────────────────────────
    kpis = [
        ('MAVS 總數',    f"{int(latest['MAVS總數']):,}",    '#2196F3'),
        ('HYVS 總數',    f"{int(latest['HYVS總數']):,}",    '#9C27B0'),
        ('MAVS 淨增長', f"{int(latest['MAVS淨增長數']):+,}", '#4CAF50' if latest['MAVS淨增長數'] >= 0 else '#F44336'),
    ]
    for i, (label, val, color) in enumerate(kpis):
        ax = fig.add_subplot(gs[0, i])
        ax.set_facecolor(color)
        ax.set_xlim(0, 1); ax.set_ylim(0, 1)
        ax.axis('off')
        ax.text(0.5, 0.62, val, ha='center', va='center',
                fontsize=22, fontweight='bold', color='white', transform=ax.transAxes)
        ax.text(0.5, 0.25, label, ha='center', va='center',
                fontsize=11, color='white', alpha=0.9, transform=ax.transAxes)

    # ── 圖1：每日激活 vs 流失 ────────────────────────────
    ax1 = fig.add_subplot(gs[1, :2])
    ax1.plot(recent['日期'], recent['每日激活數'], color='#2196F3', label='每日激活數', linewidth=2)
    ax1.plot(recent['日期'], recent['每日流失數'], color='#F44336', label='每日流失數', linewidth=2)
    ax1.fill_between(recent['日期'], recent['每日激活數'], recent['每日流失數'],
                     where=recent['每日激活數'] >= recent['每日流失數'],
                     alpha=0.15, color='#2196F3', label='激活>流失')
    ax1.fill_between(recent['日期'], recent['每日激活數'], recent['每日流失數'],
                     where=recent['每日激活數'] < recent['每日流失數'],
                     alpha=0.15, color='#F44336', label='流失>激活')
    ax1.legend(fontsize=8, loc='upper left')
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'{x:,.0f}'))
    fmt_ax(ax1, '每日激活 vs 流失（近30天）')

    # ── 圖2：MAVS 淨增長柱狀圖 ──────────────────────────
    ax2 = fig.add_subplot(gs[1, 2])
    colors_bar = ['#4CAF50' if v >= 0 else '#F44336' for v in recent['MAVS淨增長數']]
    ax2.bar(recent['日期'], recent['MAVS淨增長數'], color=colors_bar, width=0.8)
    ax2.axhline(y=0, color='#333', linewidth=1, linestyle='--')
    ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'{x:,.0f}'))
    fmt_ax(ax2, 'MAVS 淨增長數')

    # ── 圖3：MAVS & HYVS 總數趨勢 ───────────────────────
    ax3 = fig.add_subplot(gs[2, :2])
    ax3_r = ax3.twinx()
    ax3.fill_between(recent['日期'], recent['MAVS總數'], alpha=0.2, color='#4CAF50')
    ax3.plot(recent['日期'], recent['MAVS總數'], color='#4CAF50', linewidth=2, label='MAVS總數')
    ax3_r.plot(recent['日期'], recent['HYVS總數'], color='#FF9800', linewidth=2, linestyle='--', label='HYVS總數')
    ax3.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'{x/10000:.1f}萬'))
    ax3_r.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'{x/10000:.1f}萬'))
    ax3.set_ylabel('MAVS', color='#4CAF50', fontsize=9)
    ax3_r.set_ylabel('HYVS', color='#FF9800', fontsize=9)
    lines1, labels1 = ax3.get_legend_handles_labels()
    lines2, labels2 = ax3_r.get_legend_handles_labels()
    ax3.legend(lines1 + lines2, labels1 + labels2, fontsize=8, loc='lower left')
    fmt_ax(ax3, 'MAVS & HYVS 總數趨勢')
    ax3_r.tick_params(axis='y', labelsize=8)
    ax3_r.spines['top'].set_visible(False)

    # ── 圖4：每日激活率 vs 流失率 ───────────────────────
    ax4 = fig.add_subplot(gs[2, 2])
    ax4.plot(recent['日期'], recent['MAVS每日激活率'] * 100, color='#2196F3', linewidth=2, label='激活率')
    ax4.plot(recent['日期'], recent['MAVS每日流失率'] * 100, color='#F44336', linewidth=2, label='流失率')
    ax4.set_ylabel('%', fontsize=9)
    ax4.legend(fontsize=8)
    fmt_ax(ax4, 'MAVS 每日激活率 vs 流失率')

    # ── 圖5：關鍵比率趨勢 ───────────────────────────────
    ax5 = fig.add_subplot(gs[3, :2])
    ax5.plot(recent['日期'], recent['有效用戶活躍率'] * 100, color='#9C27B0', linewidth=2, label='有效用戶活躍率')
    ax5.plot(recent['日期'], recent['載具滲透率'] * 100, color='#FF9800', linewidth=2, label='載具滲透率')
    ax5.plot(recent['日期'], recent['發票同步覆蓋率'] * 100, color='#00BCD4', linewidth=2, label='發票同步覆蓋率')
    ax5.plot(recent['日期'], recent['Policy 授權轉換率'] * 100, color='#795548', linewidth=1.5, linestyle='--', label='Policy轉換率')
    ax5.axhline(y=80, color='#9C27B0', linewidth=0.8, linestyle=':', alpha=0.6)
    ax5.set_ylabel('%', fontsize=9)
    ax5.legend(fontsize=8, loc='lower left', ncol=2)
    fmt_ax(ax5, '關鍵比率趨勢 (%)')

    # ── 圖6：30日內到期 & 載具驗證失效率 ──────────────
    ax6 = fig.add_subplot(gs[3, 2])
    ax6_r = ax6.twinx()
    ax6.fill_between(recent['日期'], recent['30日內到期人數'], alpha=0.3, color='#FF5722')
    ax6.plot(recent['日期'], recent['30日內到期人數'], color='#FF5722', linewidth=2, label='30日到期')
    ax6_r.plot(recent['日期'], recent['載具驗證失效率'] * 100, color='#607D8B', linewidth=1.5, linestyle='--', label='失效率%')
    ax6.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'{x/10000:.0f}萬'))
    ax6.set_ylabel('30日到期人數', color='#FF5722', fontsize=8)
    ax6_r.set_ylabel('失效率%', color='#607D8B', fontsize=8)
    lines1, labels1 = ax6.get_legend_handles_labels()
    lines2, labels2 = ax6_r.get_legend_handles_labels()
    ax6.legend(lines1 + lines2, labels1 + labels2, fontsize=7, loc='upper left')
    fmt_ax(ax6, '30日到期人數 & 驗證失效率')
    ax6_r.tick_params(axis='y', labelsize=8)
    ax6_r.spines['top'].set_visible(False)

    plt.savefig(chart_path, dpi=150, bbox_inches='tight', facecolor='#F8F9FA')
    plt.close()
    return chart_path

# ── 分析摘要 ──────────────────────────────────────────
def analyze(df):
    df['日期'] = pd.to_datetime(df['日期'])
    df = df.sort_values('日期')
    latest = df.iloc[-1]  # 最新一筆（升冪排列，最後一筆最新）
    prev   = df.iloc[-2] if len(df) > 1 else latest

    def pct_change(a, b):
        if b == 0: return 0
        return (a - b) / b * 100

    def arrow(val):
        return "📈" if val >= 0 else "📉"

    act_chg   = pct_change(latest['每日激活數'], prev['每日激活數'])
    churn_chg = pct_change(latest['每日流失數'], prev['每日流失數'])
    net       = int(latest['MAVS淨增長數'])

    lines = [
        f"📊 *User Overview 每日報表*",
        f"🗓 資料日期：{latest['日期'].strftime('%Y-%m-%d')}",
        "",
        f"*📌 核心指標*",
        f"• MAVS 總數：{latest['MAVS總數']:,.0f}",
        f"• HYVS 總數：{latest['HYVS總數']:,.0f}",
        f"• MAVS 淨增長：{net:+,.0f} {arrow(net)}",
        "",
        f"*📌 每日動態*",
        f"• 每日激活數：{latest['每日激活數']:,.0f}（{act_chg:+.1f}% vs 前日）{arrow(act_chg)}",
        f"• 每日流失數：{latest['每日流失數']:,.0f}（{churn_chg:+.1f}% vs 前日）{arrow(-churn_chg)}",
        f"• 當日授權到期：{latest['當日授權到期數']:,.0f}",
        f"• 30日內到期：{latest['30日內到期人數']:,.0f}",
        "",
        f"*📌 比率指標*",
        f"• 有效用戶活躍率：{latest['有效用戶活躍率']*100:.2f}%",
        f"• 載具滲透率：{latest['載具滲透率']*100:.2f}%",
        f"• 發票同步覆蓋率：{latest['發票同步覆蓋率']*100:.2f}%",
        f"• Policy 授權轉換率：{latest['Policy 授權轉換率']*100:.2f}%",
        f"• Policy 續約率：{latest['Policy 續約率']*100:.2f}%",
        f"• MAVS 率：{latest['MAVS率']*100:.2f}%",
    ]

    # 簡單判斷警示
    warnings = []
    if net < -5000:
        warnings.append(f"⚠️ MAVS 淨增長連續下滑（{net:+,.0f}），流失大於激活")
    if latest['有效用戶活躍率'] < 0.80:
        warnings.append(f"⚠️ 有效用戶活躍率低於 80%（{latest['有效用戶活躍率']*100:.1f}%）")
    if latest['發票同步覆蓋率日變動'] < -0.003:
        warnings.append(f"⚠️ 發票同步覆蓋率日變動明顯下降（{latest['發票同步覆蓋率日變動']*100:.3f}%）")

    if warnings:
        lines.append("")
        lines.append("*🔔 注意事項*")
        lines.extend(warnings)

    return "\n".join(lines)

# ── 儲存到 Notion ─────────────────────────────────────
def save_to_notion(summary: str, latest: dict):
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }
    date_str = str(latest.get('日期', datetime.now().strftime('%Y-%m-%d')))[:10]
    title = f"報表 {date_str}"

    def num(val, fmt=','):
        try:
            return f"{float(val):{fmt}}" if fmt != '%' else f"{float(val)*100:.2f}%"
        except:
            return str(val)

    blocks = [
        {"object": "block", "type": "callout", "callout": {
            "rich_text": [{"type": "text", "text": {"content": f"資料日期：{date_str}　由 OpenClaw 自動生成"}}],
            "icon": {"type": "emoji", "emoji": "🤖"}, "color": "blue_background"
        }},
        {"object": "block", "type": "divider", "divider": {}},
        {"object": "block", "type": "heading_2", "heading_2": {
            "rich_text": [{"type": "text", "text": {"content": "📌 核心指標"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"MAVS 總數：{num(latest.get('MAVS總數',0))}"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"HYVS 總數：{num(latest.get('HYVS總數',0))}"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"MAVS 淨增長：{int(latest.get('MAVS淨增長數',0)):+,}"}}]
        }},
        {"object": "block", "type": "heading_2", "heading_2": {
            "rich_text": [{"type": "text", "text": {"content": "📌 每日動態"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"每日激活數：{num(latest.get('每日激活數',0))}"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"每日流失數：{num(latest.get('每日流失數',0))}"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"30日內到期人數：{num(latest.get('30日內到期人數',0))}"}}]
        }},
        {"object": "block", "type": "heading_2", "heading_2": {
            "rich_text": [{"type": "text", "text": {"content": "📌 比率指標"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"有效用戶活躍率：{num(latest.get('有效用戶活躍率',0), '%')}"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"載具滲透率：{num(latest.get('載具滲透率',0), '%')}"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"發票同步覆蓋率：{num(latest.get('發票同步覆蓋率',0), '%')}"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"Policy 授權轉換率：{num(latest.get('Policy 授權轉換率',0), '%')}"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"Policy 續約率：{num(latest.get('Policy 續約率',0), '%')}"}}]
        }},
        {"object": "block", "type": "bulleted_list_item", "bulleted_list_item": {
            "rich_text": [{"type": "text", "text": {"content": f"MAVS 率：{num(latest.get('MAVS率',0), '%')}"}}]
        }},
    ]

    # 建立子頁面
    resp = requests.post(
        "https://api.notion.com/v1/pages",
        headers=headers,
        json={
            "parent": {"page_id": NOTION_REPORT_PAGE_ID},
            "icon": {"type": "emoji", "emoji": "📊"},
            "properties": {
                "title": {"title": [{"text": {"content": title}}]}
            },
            "children": blocks
        },
        timeout=15
    )
    resp.raise_for_status()
    page = resp.json()
    page_url = f"https://www.notion.so/{page['id'].replace('-','')}"
    print(f"✅ Notion 頁面建立：{page_url}")
    return page_url


# ── 主流程 ────────────────────────────────────────────
def main():
    print("📡 撈取報表資料...")
    raw = fetch_data()
    df = pd.DataFrame(raw)
    print(f"✅ 取得 {len(df)} 筆資料")

    print("🎨 生成圖表...")
    chart_path = generate_charts(df)
    print(f"✅ 圖表儲存至 {chart_path}")

    print("🧠 生成分析摘要...")
    df_sorted = df.copy()
    df_sorted['日期'] = pd.to_datetime(df_sorted['日期'])
    df_sorted = df_sorted.sort_values('日期')
    latest_row = df_sorted.iloc[-1].to_dict()
    summary = analyze(df)
    print("─" * 50)
    print(summary)
    print("─" * 50)

    print("📝 儲存到 Notion...")
    notion_url = save_to_notion(summary, latest_row)

    # 輸出 JSON 供 OpenClaw 讀取
    result = {
        "chart_path": str(chart_path),
        "summary": summary,
        "notion_url": notion_url
    }
    print(f"\n__RESULT_JSON__:{json.dumps(result, ensure_ascii=False)}")

if __name__ == "__main__":
    main()
