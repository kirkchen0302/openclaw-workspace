# 指標定義、計算方式與資料來源

> 最後更新：2026-03-23（BQ 驗證）
> 所有數字已用 `invos-insight-query` 專案對 `production-379804` 執行查詢驗證

---

## 資料來源總覽

### 主要來源：syncer view（Dashboard 使用）

| 表 | 用途 |
|---|---|
| `base_marts.base__computed_sat__verified_syncer` | **Dashboard 的主要資料來源**，每日快照，一個 member_hk 一筆 |

**syncer view 欄位：**

| 欄位 | 型別 | 定義 |
|---|---|---|
| `member_hk` | BYTES | 會員唯一 key |
| `effective_from` | DATE | 快照日期（用作分區篩選） |
| `is_member_active` | BOOL | 會員未刪除（status ≠ DEACTIVATED），**不是** 30 天活躍 |
| `is_carrier_bound` | BOOL | 有綁定載具（`is_active = true`，含 919） |
| `is_carrier_active` | BOOL | 載具正常同步（`is_active = true AND mof_status = 'SUCCESS'`，排除 919） |
| `is_policy_active` | BOOL | Policy 有效（`policy_last_accepted_at + 180天 > effective_from`） |
| `is_invoice_active_30d` | BOOL | 近 30 天有發票 |
| `is_invoice_active_180d` | BOOL | 近 180 天有發票 |
| `policy_last_accepted_at` | DATETIME | 最後一次 Policy 授權時間 |

**關鍵語意：**
- `is_carrier_bound = true AND is_carrier_active = false` → **919 載具失效**
- `is_carrier_bound = false` → **無載具**
- `is_member_active = false` → **已刪除（DEACTIVATED）**

### 補充來源：intermediate 層（分析用）

| 表 | 用途 | 分區 |
|---|---|---|
| `intermediate.sat__member` | 會員狀態 SCD 快照 | `effective_from` (DAY) |
| `intermediate.sat__carrier` | 載具狀態 SCD 快照 | `effective_from` (DAY) |
| `intermediate.ma_sat__member_policy_statement` | Policy 授權紀錄 | `effective_from` (DAY) |
| `intermediate.sat__invoice` | 發票紀錄 | `issued_at` (DAY) |

### 補充來源：base_marts 層

| 表 | 用途 |
|---|---|
| `base_marts.base__link__member_carrier` | 會員 ↔ 載具關聯 |
| `base_marts.base__link__member_invoice` | 會員 ↔ 發票關聯 |
| `base_marts.base__link__member_session` | 會員 ↔ Session 關聯 |
| `base_marts.base__sat__session_session_start_activity` | Session 開始事件（`created_date`, `platform`） |
| `base_marts.base__sat__session_pageview_activity` | 頁面瀏覽事件（`page`, `created_date`） |
| `base_marts.base__hub__member` | member_hk ↔ member_id 對照 |
| `base_marts.base__sat__app_usage` | App 安裝/卸載聚合統計 |

### 外部來源

| 來源 | 用途 |
|---|---|
| GA4 Data API (`properties/158616188`) | 活躍用戶驗證、事件分析 |
| Google Play Console (`gs://pubsite__rev_*`) | Android 下載/卸載 |
| App Store Connect | iOS 首次下載 |

---

## 一、會員基礎指標

### 累計會員總數（含刪除）

| 項目 | 內容 |
|---|---|
| **定義** | 所有曾註冊的會員數 |
| **Dashboard 來源** | syncer: `COUNT(DISTINCT member_hk) WHERE effective_from = report_date` |
| **分析用來源** | `intermediate.sat__member`: 每個 member_hk 取最新狀態（`ROW_NUMBER() OVER (PARTITION BY member_hk ORDER BY effective_from DESC) = 1`），計算 `CAST(created_at AS DATE) <= report_date` 的數量 |
| **BQ 驗證 (3/19)** | **5,536,605** |

### 未刪除會員數

| 項目 | 內容 |
|---|---|
| **定義** | 累計會員 - 已刪除（DEACTIVATED） |
| **Dashboard 來源** | syncer: `COUNTIF(is_member_active)` |
| **分析用來源** | `intermediate.sat__member`: 最新狀態 `status != 'DEACTIVATED'` |
| **注意** | `INACTIVE` 狀態**不算刪除**，只有 `DEACTIVATED` 算 |
| **BQ 驗證 (3/19)** | **5,507,613** |

### 當日新註冊

| 項目 | 內容 |
|---|---|
| **定義** | 當日 `CAST(created_at AS DATE) = report_date` 的不重複 member_hk 數 |
| **來源** | `intermediate.sat__member`（需 ROW_NUMBER 去重） |

### 當日刪除

| 項目 | 內容 |
|---|---|
| **定義** | `status = 'DEACTIVATED' AND CAST(effective_from AS DATE) = report_date` |
| **來源** | `intermediate.sat__member` |
| **注意** | 2025-01~08 刪除數為 0，可能是 2025-09 才統一標記歷史刪除 |

---

## 二、載具指標

### 載具綁定（含 919）

| 項目 | 內容 |
|---|---|
| **定義** | 有任何一個載具 `is_active = true` 的會員數（包含 919 失效） |
| **Dashboard 來源** | syncer: `COUNTIF(is_carrier_bound)` |
| **分析用來源** | `intermediate.sat__carrier` JOIN `base__link__member_carrier`，`is_active = true` 的不重複 member_hk |
| **BQ 驗證 (3/19)** | **5,163,556**（93.7%） |

### 載具正常（排除 919）

| 項目 | 內容 |
|---|---|
| **定義** | 載具 `is_active = true AND mof_status = 'SUCCESS'` 的會員數 |
| **Dashboard 來源** | syncer: `COUNTIF(is_carrier_active)` |
| **分析用來源** | `intermediate.sat__carrier` JOIN `base__link__member_carrier`，`is_active = true AND mof_status = 'SUCCESS'` |
| **BQ 驗證 (3/19)** | **3,993,662**（72.5%） |

### 919 載具失效

| 項目 | 內容 |
|---|---|
| **定義** | 載具綁定但同步失敗 |
| **Dashboard 來源（推薦）** | syncer: `COUNTIF(is_carrier_bound AND NOT is_carrier_active)` |
| **分析用來源** | `intermediate.sat__carrier`: `is_active = true AND mof_status = 'INACCURATE_AVAILABILITY'` |
| **BQ 驗證 (3/19)** | syncer: **1,169,183** ｜ raw carrier: **~1,203,000** |
| **兩者差異原因** | syncer 在 member 層級去重；raw carrier 可能因一人多載具而偏高 |

### mof_status 值定義

| 值 | API 定義 | 說明 |
|---|---|---|
| `SUCCESS` | 同步財政部成功 | 載具正常 |
| `INACCURATE_AVAILABILITY` | MOF 回傳 919 錯誤 | 驗證碼不一致 |
| `UNKNOWN` | 未預期錯誤 | 極少數 |
| `CONNECTION_TIMEOUT` | 連線逾時 | 極少數，通常 is_active=false |

---

## 三、Policy 指標

### Policy 有效會員數

| 項目 | 內容 |
|---|---|
| **定義** | 最後一次 Policy 授權日 + 180 天 > report_date |
| **Dashboard 來源** | syncer: `COUNTIF(is_policy_active)` |
| **等價計算** | syncer: `COUNTIF(DATE_ADD(CAST(policy_last_accepted_at AS DATE), INTERVAL 180 DAY) > effective_from)` |
| **分析用來源** | `intermediate.ma_sat__member_policy_statement`: `MAX(CAST(effective_from AS DATE))` + 180天 > report_date |
| **有效期** | **180 天**（6 個月），依據 API 文件 policy_statement_status 推算 |
| **BQ 驗證 (3/19)** | **2,989,132**（54.3%） |
| **注意** | `policy_last_accepted_at IS NULL` = 從未授權 Policy，共 2,518,481 人 |

### Policy 狀態分期

| 狀態 | 條件 | 說明 |
|---|---|---|
| renewed | 到期日 > 今天 + 70天 | 距到期 >70 天 |
| soft_reminder | 到期前 70 天內 | App 開始提醒 |
| expiring_soon | 到期前 20 天內 | 即將到期 |
| expired | 到期日 < 今天 | 已過期 |

---

## 四、發票指標

### 近 30 天有發票會員數

| 項目 | 內容 |
|---|---|
| **定義** | 近 30 天有任何發票紀錄的會員 |
| **Dashboard 來源** | syncer: `COUNTIF(is_invoice_active_30d)` |
| **分析用來源** | `intermediate.sat__invoice` JOIN `base__link__member_invoice`，`CAST(issued_at AS DATE) BETWEEN DATE_SUB(report_date, INTERVAL 30 DAY) AND report_date` |
| **BQ 驗證 (3/19)** | **2,598,230** |

### 近 180 天有發票會員數

| 項目 | 內容 |
|---|---|
| **定義** | 近 180 天有任何發票紀錄的會員 |
| **Dashboard 來源** | syncer: `COUNTIF(is_invoice_active_180d)` |
| **BQ 驗證 (3/19)** | **2,996,986** |
| **⚠️ 注意** | 此數字**不是 HYVS**。HYVS 還需要 carrier_bound ∩ policy_active 的交集 |

### 近 30 天有載具發票會員數

| 項目 | 內容 |
|---|---|
| **定義** | 近 30 天有 `carrier_type IS NOT NULL AND carrier_type != ''` 的發票 |
| **來源** | `intermediate.sat__invoice` JOIN `base__link__member_invoice` |
| **syncer 無此欄位** | syncer 的 `is_invoice_active_30d` 不區分載具發票 |

---

## 五、活躍指標

### MAU（30 天活躍會員數）

| 項目 | 內容 |
|---|---|
| **定義** | 近 30 天有 session_start 的不重複會員數 |
| **來源** | `base__sat__session_session_start_activity` JOIN `base__link__member_session`，`created_date BETWEEN DATE_SUB(report_date, INTERVAL 30 DAY) AND report_date` |
| **BQ 驗證 (3/19)** | **2,343,746** |
| **限制** | session 資料從 **2025-03-01** 開始；ETL 未回溯 mapping 註冊前的 session |
| **⚠️ 注意** | MAU ≠ MAVS。MAU 只看 session，MAVS 還需交集 carrier + policy + invoice |

### 沉睡

| 項目 | 內容 |
|---|---|
| **定義** | 未刪除會員且近 30 天**沒有** session_start |
| **計算** | 未刪除會員 - MAU |
| **注意** | syncer 的 `is_member_active` 指「未刪除」，**不是**「30 天活躍」 |

---

## 六、HYVS

| 項目 | 內容 |
|---|---|
| **定義** | 載具綁定（is_carrier_bound）∩ Policy 有效（is_policy_active）∩ 近 180 天有發票（is_invoice_active_180d） |
| **Dashboard 來源** | syncer: `COUNTIF(is_carrier_bound AND is_policy_active AND is_invoice_active_180d)` |
| **update_daily.sh** | 同上 |
| **BQ 驗證 (3/19)** | **2,812,983** |

### HYVS 常見錯誤

| 錯誤算法 | 結果 | 差距 |
|---|---|---|
| ❌ `COUNTIF(is_invoice_active_180d)` — 少了 carrier + policy | 2,996,986 | +184K |
| ❌ `COUNTIF(is_carrier_active AND is_policy_active AND is_invoice_active_180d)` — 用 carrier_active 而非 carrier_bound（排除了 919） | 2,658,310 | -155K |

**正確算法必須用 `is_carrier_bound`（含 919）而非 `is_carrier_active`（排除 919）。** 因為 HYVS 衡量的是「有載具綁定」而非「載具正常同步」。

---

## 七、MAVS

| 項目 | 內容 |
|---|---|
| **定義** | 近 30 天有 session ∩ 載具綁定（is_carrier_bound）∩ Policy 有效（is_policy_active）∩ 近 30 天有發票（is_invoice_active_30d） |
| **條件數** | **4 個條件** |
| **Dashboard 來源** | session 表 JOIN syncer view（見 `update_daily.sh`） |
| **BQ 驗證 (3/19)** | **2,100,975** |

### MAVS 計算 SQL

```sql
WITH active_members AS (
  SELECT DISTINCT ms.member_hk
  FROM `base_marts.base__sat__session_session_start_activity` s
  JOIN `base_marts.base__link__member_session` ms ON s.session_hk = ms.session_hk
  WHERE s.created_date BETWEEN DATE_SUB(@report_date, INTERVAL 30 DAY) AND @report_date
)
SELECT COUNT(DISTINCT a.member_hk) AS mavs
FROM active_members a
JOIN `base_marts.base__computed_sat__verified_syncer` vs
  ON vs.member_hk = a.member_hk
  AND CAST(vs.effective_from AS DATE) = @report_date
WHERE vs.is_carrier_bound
  AND vs.is_policy_active
  AND vs.is_invoice_active_30d
```

### MAVS 各種定義比較

| 定義 | 條件數 | BQ (3/19) | 使用場景 |
|---|---|---|---|
| session only（MAU） | 1 | 2,343,746 | 純活躍指標 |
| session ∩ carrier_bound ∩ policy | 3 | 2,275,465 | — |
| **session ∩ carrier_bound ∩ policy ∩ invoice_30d** | **4** | **2,100,975** | **Dashboard、executive_summary** |
| session ∩ carrier_active ∩ policy ∩ invoice_30d | 4 | 2,072,724 | — |

---

## 八、919 分析指標

### 919 存量

| 項目 | 內容 |
|---|---|
| **推薦定義** | syncer: `COUNTIF(is_carrier_bound AND NOT is_carrier_active)` |
| **BQ 驗證 (3/19)** | **1,169,183** |
| **替代算法** | `intermediate.sat__carrier` WHERE `is_active = true AND mof_status = 'INACCURATE_AVAILABILITY'`，結果為 ~1,203,000（member 層未去重，偏高） |

### 919 沉睡率

| 項目 | 內容 |
|---|---|
| **定義** | 919 會員中近 30 天沒有 session 的比例 |
| **BQ 驗證 (3/19)** | **89.2%**（1,043,213 / 1,169,183） |

### 919 新增/修復

| 項目 | 內容 |
|---|---|
| **新增** | `intermediate.sat__carrier` WHERE `prev_status = 'SUCCESS' AND mof_status = 'INACCURATE_AVAILABILITY'` |
| **修復** | `intermediate.sat__carrier` WHERE `prev_status = 'INACCURATE_AVAILABILITY' AND mof_status = 'SUCCESS'` |
| **prev_status** | `LAG(mof_status) OVER (PARTITION BY carrier_hk ORDER BY effective_from)` |

### 修好又壞率

| 項目 | 內容 |
|---|---|
| **定義** | 曾被修復（919→SUCCESS）的人中，後來又變 919 的比例 |
| **BQ 驗證** | **85.2%**（625,987 / 734,835） |

---

## 九、交叉指標

### 活躍 × Policy 交叉矩陣

| 象限 | 計算 | BQ (3/19) |
|---|---|---|
| 活躍 + Policy 有效 | MAU ∩ policy_active | 2,278,730 |
| 活躍 + Policy 過期 | MAU ∩ NOT policy_active | 64,947 |
| 沉睡 + Policy 有效 | NOT MAU ∩ policy_active | 710,402 |
| 沉睡 + Policy 過期 | NOT MAU ∩ NOT policy_active | 2,453,534 |

### 919 × Policy 過期

| 路徑 | 計算 | BQ (3/19) | 佔比 |
|---|---|---|---|
| 919→沉睡→Policy 過期 | 919 ∩ 沉睡 ∩ policy 過期 | 937,653 | 37.2% |
| 自然沉睡→Policy 過期 | 非 919 ∩ 沉睡 ∩ policy 過期 | 1,515,881 | 60.2% |
| 活躍但 Policy 過期 | MAU ∩ policy 過期 | 64,947 | 2.6% |
| **Policy 過期總數** | | **2,518,481** | 100% |

---

## 十、卸載數據

| 項目 | 內容 |
|---|---|
| **來源** | `base_marts.base__sat__app_usage` |
| **欄位** | `user_install_count`, `user_uninstall_count` |
| **限制** | 聚合統計，**無日期維度、無法對應個別會員** |
| **Android 精確數據** | Google Play Console: `gs://pubsite__rev_*/stats/installs/` |
| **iOS 精確數據** | App Store Connect 匯出 |

---

## 十一、資料限制

| 限制 | 影響 | 嚴重度 |
|---|---|---|
| Session ETL 未回溯 mapping 註冊前 session | 新註冊 MAVS 無法精確計算，約 30~50% 新用戶查不到 session | 🔴 高 |
| 載具為最新快照，非每日歷史 | syncer view 有每日快照，但 raw carrier 只有最新狀態 | 🟡 中 |
| GA4 Daily Export 未開啟 | 串流可能丟失 <2% 事件 | 🟡 中 |
| 卸載為聚合統計 | 無法對應個別會員、無法按月拆 | 🟡 中 |
| 發票 48hr 同步延遲 | 新用戶當天/次日看不到發票 | 🟢 低 |
| syncer view 2025-07-23 前數據不完整 | 載具/Policy 欄位在此日期前未回填，HYVS/MAVS 趨勢只能從 7/25 起信任 | 🟡 中 |

---

## 十二、Dashboard 數據管線

### update_daily.sh 查詢邏輯

| 指標 | SQL | 來源 |
|---|---|---|
| **HYVS** | `COUNTIF(is_carrier_bound AND is_policy_active AND is_invoice_active_180d)` | syncer view |
| **MAVS** | session 表 JOIN syncer，WHERE `is_carrier_bound AND is_policy_active AND is_invoice_active_30d` | session + syncer |
| **會員總覽** | syncer 各 flag 直接 COUNTIF | syncer view |
| **919 新增** | `sat__carrier` WHERE `mof_status = 'INACCURATE_AVAILABILITY'` | intermediate |
| **Policy** | syncer `COUNTIF(is_policy_active)` | syncer view |

### 查詢執行

| 項目 | 內容 |
|---|---|
| **執行專案** | `invoice-bfd85`（查詢計費）或 `invos-insight-query` |
| **資料專案** | `production-379804`（所有表都在此） |
| **排程** | 每日早上 8:00（cron） |
| **輸出** | CSV → 手動/腳本追加到 `dashboard/index.html` 的 JS array |
