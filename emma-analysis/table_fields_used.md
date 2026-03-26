# 使用的資料表 × 欄位明細

> 最後更新：2026-03-19

## intermediate.sat__member
| 欄位 | 型別 | 用途 |
|---|---|---|
| `member_hk` | BYTES | 會員唯一 key，所有 JOIN 的核心 |
| `status` | STRING | 會員狀態：EMAIL_VERIFIED / PHONE_CALL_VERIFIED / INACTIVE / DEACTIVATED |
| `created_at` | DATETIME | 註冊時間，用 `CAST(created_at AS DATE)` 取註冊日 |
| `effective_from` | DATETIME | 狀態變更時間，取最新狀態（ROW_NUMBER OVER PARTITION BY member_hk ORDER BY effective_from DESC）、刪除日期 |

**未使用**：email, nickname, phone_number, is_invoice_notification_subscribed, logged_in_at, address, birthday, gender

**限制**：SCD 快照表，每個 member_hk 可能有多筆，需用 ROW_NUMBER 取最新。`effective_from` 是狀態變更時間，不一定是刪除時間（2025-01~08 刪除為 0，可能是 2025-09 才統一標記）。

---

## base_marts.base__hub__member
| 欄位 | 型別 | 用途 |
|---|---|---|
| `member_hk` | BYTES | 與 sat__member 關聯 |
| `member_id` | INT64 | 會員 ID，對應 Firebase user_id，用於 GA4 驗證及平台拆分 |

**限制**：100% 有 member_id（5,534,867 筆全部非 NULL）。

---

## intermediate.sat__carrier
| 欄位 | 型別 | 用途 |
|---|---|---|
| `carrier_hk` | BYTES | 載具唯一 key，與 link 表關聯 |
| `is_active` | BOOL | 載具是否綁定中：`true` = 綁定中（但不代表能正常同步） |
| `mof_status` | STRING | 財政部同步狀態，用於 919 分析 |
| `effective_from` | TIMESTAMP | 狀態變更時間，用 ROW_NUMBER 取每個 carrier_hk 的最新狀態 |

**mof_status 值定義（來自 API 文件）：**

| 值 | API 定義 | 數量 |
|---|---|---|
| `SUCCESS` | 載具同步財政部成功 | 3,992,633（is_active=true） |
| `INACCURATE_AVAILABILITY` | 同步失敗，MOF 回傳 919 錯誤（驗證碼失效） | 1,203,469（is_active=true） |
| `UNKNOWN` | 未預期錯誤 | 160（is_active=true） |
| `CONNECTION_TIMEOUT` | 連線逾時 | 54（is_active=false） |

**載具有效的兩種定義：**
- **寬鬆（93.7%）**：`is_active = true`（含 919 失效的人）
- **嚴格（72.4%）**：`is_active = true AND mof_status = 'SUCCESS'`（排除 919）

**未使用**：type, created_at

**限制**：目前是最新快照，非每日歷史。每個 carrier_hk 可能有多筆狀態變更，需用 ROW_NUMBER 取最新。919 問題（120 萬人）在 2026-02 外部簡訊提醒後幾乎無改善。

---

## base_marts.base__link__member_carrier
| 欄位 | 型別 | 用途 |
|---|---|---|
| `member_hk` | BYTES | 關聯回會員 |
| `carrier_hk` | BYTES | 關聯到 sat__carrier |

**限制**：一個會員可能有多個載具（主載具+子載具），DISTINCT member_hk 避免重複計算。

---

## intermediate.ma_sat__member_policy_statement
| 欄位 | 型別 | 用途 |
|---|---|---|
| `member_hk` | BYTES | 關聯回會員 |
| `effective_from` | DATETIME | 授權時間，`MAX()` 取最後授權日，`+ 180 DAY` 算到期日 |

**定義（來自 API 文件）：**
- 每次用戶同意授權會產生一筆記錄
- 有效期 180 天（6 個月）
- Policy 狀態：renewed(>70天) / soft_reminder(70天內) / expiring_soon(20天內) / expired

**限制**：一個會員可能有多筆授權記錄（每次續約一筆），用 MAX(effective_from) 取最新。資料從 2021-08 起（2,700 萬筆）。

---

## intermediate.sat__invoice
| 欄位 | 型別 | 用途 |
|---|---|---|
| `invoice_hk` | BYTES | 發票唯一 key，與 link 表關聯 |
| `issued_at` | DATETIME | 發票開立時間，判斷近 30 天 / 180 天 |
| `carrier_type` | STRING | 載具類型，`IS NOT NULL AND != ''` 判斷是否為載具發票。值如 `3J0002`（手機條碼）|

**未使用**：carrier_barcode, currency, seller_tax_id, total_price, type, load_datetime

**限制**：
- 按 `issued_at` 分區（DAY），查詢時用日期過濾可降低成本
- 發票有 48 小時同步延遲（新註冊用戶的發票不會即時出現）
- 資料從 2019-04 起

---

## base_marts.base__link__member_invoice
| 欄位 | 型別 | 用途 |
|---|---|---|
| `member_hk` | BYTES | 關聯回會員 |
| `invoice_hk` | BYTES | 關聯到 sat__invoice |

---

## base_marts.base__sat__session_session_start_activity
| 欄位 | 型別 | 用途 |
|---|---|---|
| `session_hk` | BYTES | Session 唯一 key，與 link 表關聯 |
| `created_date` | DATE | Session 日期，判斷近 30 天活躍、留存曲線 |
| `platform` | STRING | 平台：ANDROID / IOS，用於平台拆分 |

**未使用**：event_name, app_version, traffic_source, first_opened_at

**限制**：
- 資料從 2025-03-01 起（381 天，338 萬會員）
- 來自 Firebase GA4 串流，經 ETL 匯入 production
- **ETL 未回溯 mapping 註冊前的 session**（user_pseudo_id → user_id），導致新用戶 session 不完整（約 30~50% 查不到）
- GA4 串流可能丟失少量事件（<2%），與 GA4 API 比對差異 1~2%

---

## base_marts.base__link__member_session
| 欄位 | 型別 | 用途 |
|---|---|---|
| `member_hk` | BYTES | 關聯回會員 |
| `session_hk` | BYTES | 關聯到 session 活動表 |

**限制**：只有註冊後的 session 能關聯到 member_hk（因為註冊前只有 user_pseudo_id）。

---

## base_marts.base__sat__session_pageview_activity
| 欄位 | 型別 | 用途 |
|---|---|---|
| `session_hk` | BYTES | 與 link 表關聯 |
| `page` | STRING | 頁面名稱，分析沉睡前最後功能 |
| `created_date` | DATE | 瀏覽日期，取最新一筆 |

**page 值範例**：home, myinvoice, carrier, scanner, prizeResult, taskDetail, manualCheck, invoiceDetail, rewardShop, privacyPolicy

**未使用**：platform, pageview_count 等

---

## base_marts.base__sat__app_usage
| 欄位 | 型別 | 用途 |
|---|---|---|
| `user_install_count` | INT64 | 累計安裝用戶數（SUM = 1,279,001） |
| `user_uninstall_count` | INT64 | 累計卸載用戶數（SUM = 691,498） |

**未使用**：app_usage_hk, device_install_count, event_install_count, event_uninstall_count, event_update_count

**限制**：來自 Google Play / App Store 聚合統計，**無法對應到個別會員**。只有總數，無法按月拆分。

---

## GA4 Data API（驗證用，非 BigQuery）

**Endpoint**：`https://analyticsdata.googleapis.com/v1beta/properties/158616188:runReport`

**使用的指標**：
- `activeUsers` — 每日活躍用戶數
- `sessions` — Session 數
- `newUsers` — 新用戶數
- `totalUsers` — 總用戶數
- `eventCount` — 事件次數

**使用的維度**：
- `date` — 日期
- `eventName` — 事件名稱（first_open, sign_up, first_visit）
- `newVsReturning` — 新用戶/回訪

**限制**：GA4 API 是聚合報表，無法看個別用戶。activeUsers 包含 guest（未登入），BQ session 表只有會員。

---

## 彙總：所有 JOIN 路徑

```
intermediate.sat__member (member_hk, status, created_at, effective_from)
  │
  ├── base_marts.base__hub__member (member_hk → member_id)
  │
  ├── base_marts.base__link__member_carrier (member_hk → carrier_hk)
  │     └── intermediate.sat__carrier (carrier_hk → is_active, mof_status, effective_from)
  │
  ├── intermediate.ma_sat__member_policy_statement (member_hk → effective_from)
  │
  ├── base_marts.base__link__member_invoice (member_hk → invoice_hk)
  │     └── intermediate.sat__invoice (invoice_hk → issued_at, carrier_type)
  │
  └── base_marts.base__link__member_session (member_hk → session_hk)
        ├── base_marts.base__sat__session_session_start_activity (session_hk → created_date, platform)
        └── base_marts.base__sat__session_pageview_activity (session_hk → page, created_date)

獨立表（無 JOIN）：
  └── base_marts.base__sat__app_usage (user_install_count, user_uninstall_count)
```

---

## 資料限制彙總

| 限制 | 影響 | 嚴重度 |
|---|---|---|
| Session ETL 未回溯 mapping 註冊前 session | 新註冊 MAVS 無法精確計算，約 30~50% 新用戶查不到 session | 🔴 高 |
| 載具為最新快照，非每日歷史 | 無法追蹤載具每日變動、919 何時發生 | 🟡 中 |
| GA4 Daily Export 未開啟 | 串流可能丟失少量事件（<2%） | 🟡 中 |
| 卸載為聚合統計 | 無法對應個別會員、無法按月拆 | 🟡 中 |
| 發票 48hr 同步延遲 | 新用戶當天/次日看不到發票，需用 7天/30天窗口觀察 | 🟢 低 |
| 新註冊 HYVS 用 30天近似 180天 | 新用戶第一個月差異不大 | 🟢 低 |
