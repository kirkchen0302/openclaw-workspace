# 資料來源清單

## GCP 專案

| 專案 | 用途 |
|---|---|
| `production-379804` | 會員系統主要資料（BigQuery + Cloud SQL） |
| `invoice-bfd85` | Firebase / GA4 資料 |

## BigQuery 使用的表

### production-379804.intermediate（主要資料層，原始資料 + rename）

| 表名 | 用途 | 分區欄位 | 關鍵欄位 |
|---|---|---|---|
| `sat__member` | 會員狀態（SCD 快照） | `effective_from` (DAY) | member_hk, status, created_at, effective_from |
| `ma_sat__member_policy_statement` | Policy 授權紀錄 | `effective_from` (DAY) | member_hk, effective_from |
| `sat__carrier` | 載具狀態 | `effective_from` (DAY) | carrier_hk, is_active, mof_status, type |
| `sat__invoice` | 發票紀錄 | `issued_at` (DAY) | invoice_hk, carrier_type, issued_at, total_price, type |
| `sat__session_session_start_activity` | Session 開始事件 | — | session_hk, platform, created_date |

### production-379804.base_marts（基礎數據層，view）

| 表名 | 用途 | 關鍵欄位 |
|---|---|---|
| `base__hub__member` | 會員 Hub（ID mapping） | member_hk, member_id |
| `base__hub__session` | Session Hub | session_hk, session_id |
| `base__link__member_carrier` | 會員 ↔ 載具關聯 | member_hk, carrier_hk |
| `base__link__member_invoice` | 會員 ↔ 發票關聯 | member_hk, invoice_hk |
| `base__link__member_session` | 會員 ↔ Session 關聯 | member_hk, session_hk |
| `base__sat__session_session_start_activity` | Session 開始（同 intermediate） | session_hk, platform, created_date |
| `base__sat__session_pageview_activity` | 頁面瀏覽 | session_hk, page, created_date |
| `base__sat__session_click_activity` | 點擊事件 | session_hk, page, component, created_date |
| `base__sat__session_login_activity` | 登入事件 | session_hk, login_type, created_date |
| `base__sat__session_sign_up_activity` | 註冊事件 | session_hk, created_date |
| `base__sat__app_usage` | App 安裝/卸載統計 | app_usage_hk, user_install_count, user_uninstall_count |

### production-379804.raw（原始事件）

| 表名 | 用途 | 分區 |
|---|---|---|
| `event_member_created` | 會員建立事件 | DAY |
| `event_member_updated` | 會員更新事件 | DAY |
| `event_carrier_created` | 載具建立事件 | DAY |
| `event_carrier_updated` | 載具更新事件 | DAY |
| `event_invoice_completed` | 發票完成事件 | DAY |
| `event_policy_statement_created` | Policy 授權事件 | DAY |

### production-379804.staging（Firebase 串流，只保留當天）

| 表名 | 用途 |
|---|---|
| `psa__ga_event_user_activity` | GA4 原始事件（含 member_id, guest_id），只有當天資料 |
| `base__ga_event_user_activity` | 同上，base 層 |

### production-379804.information_marts（預計算 view，本次分析未使用）

包含 `fct__*` 開頭的各種聚合 view，例如：
- `fct__member_daily_verified_syncer_summary` — MAVS 快照（單日，硬編碼日期）
- `fct__member_daily_status_distribution_summary` — 會員狀態分佈
- `fct__app_daily_performance_summary` — App 安裝/卸載
- 其他 80+ 個 view

**本次分析全部使用 intermediate 層原始資料計算，未使用 information_marts 預計算結果。**

### invoice-bfd85（Firebase / GA4）

| Dataset | 用途 | 狀態 |
|---|---|---|
| `analytics_158616188` | GA4 正式版（Invoice-firebase） | Daily export 關閉，只有 14 天歷史 |
| `analytics_382839978` | GA4 測試版（staging） | 只有 intraday，4 個 user |
| `firebase_crashlytics` | Crash 報告 | 未使用 |
| `firebase_messaging` | 推播資料 | 未使用 |

## GA4 API

| Property ID | 名稱 | 用途 |
|---|---|---|
| 158616188 | Invoice-firebase | 正式版，用於驗證 BigQuery 數據 |
| 382839978 | invoice-firebase-staging-d2028 | 測試版 |

API endpoint: `https://analyticsdata.googleapis.com/v1beta/properties/158616188:runReport`

## Cloud SQL（MySQL，尚未連接）

| 實例 | 版本 | IP | 用途 |
|---|---|---|---|
| `microservice-mysql` | MySQL 8.0 | 35.194.137.207 | 主庫 |
| `microservice-mysql-replica-1` | MySQL 8.0 | 34.81.15.181 | 唯讀副本 1 |
| `microservice-mysql-replica-2` | MySQL 8.0 | 34.80.141.112 | 唯讀副本 2 |

## 資料關聯圖

```
member_hk (核心 key)
  ├── base__hub__member → member_id（= Firebase user_id）
  ├── base__link__member_carrier → carrier_hk → sat__carrier
  ├── base__link__member_invoice → invoice_hk → sat__invoice
  ├── base__link__member_session → session_hk → sat__session_*
  └── ma_sat__member_policy_statement（直接用 member_hk）
```

## 資料時間範圍

| 資料 | 最早 | 最晚 | 天數 |
|---|---|---|---|
| 會員（sat__member） | 2017-11 | 2026-03-17 | ~3000天 |
| Policy（ma_sat__member_policy_statement） | 2021-08 | 2026-03-17 | ~1700天 |
| 載具（sat__carrier） | ~2020 | 2026-03-16 | ~2000天 |
| 發票（sat__invoice） | 2019-04 | 2026-03-18 | ~2500天 |
| Session（session_start_activity） | 2025-03-01 | 2026-03-16 | 381天 |
| GA4 API | 資源建立起 | 即時 | 完整 |
