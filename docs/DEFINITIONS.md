# 受眾回訪分析 Dashboard — 指標定義文件

> 最後更新：2026-03-26

---

## 一、四群定義

以 **快照基準日（2026-03-22）** 為準，固定分群，不隨日期變動。

| 群組 | 條件 |
|------|------|
| iOS 近30天活躍 | 平台 = iOS，快照基準前 30 天內有 `session_start` event |
| iOS >30天未活躍 | 平台 = iOS，快照基準前 30 天內無 `session_start` event |
| Android 近30天活躍 | 平台 = Android，快照基準前 30 天內有 `session_start` event |
| Android >30天未活躍 | 平台 = Android，快照基準前 30 天內無 `session_start` event |

---

## 二、活躍使用者定義

- **依據**：`base__sat__session_session_start_activity` table
- **判斷**：快照基準前 30 天內有任一 `session_start` event
- **不參考**其他 event（page_view、purchase 等一律不算）

---

## 三、919 載具定義

**919 = 手機載具條碼仍存在，但財政部驗證碼最新狀態為錯誤**

使用者因此無法同步發票資料。

### 正確 BQ 邏輯

```sql
is_919 AS (
  SELECT DISTINCT lmc.member_hk
  FROM `production-379804.base_marts.base__link__member_carrier` lmc
  JOIN (
    SELECT carrier_hk, is_active, mof_status,
      ROW_NUMBER() OVER (PARTITION BY carrier_hk ORDER BY effective_from DESC) AS rn
    FROM `production-379804.intermediate.sat__carrier`
  ) c ON lmc.carrier_hk = c.carrier_hk
  WHERE c.rn = 1
    AND c.is_active = TRUE
    AND c.mof_status = 'INACCURATE_AVAILABILITY'
)
```

### 欄位說明

| 欄位 | 說明 |
|------|------|
| `is_active` | 載具條碼是否存在。`FALSE` = 已被刪除，不納入 919 判斷 |
| `mof_status` | 財政部驗證結果。`sat__carrier` 為 SCD2 設計，同一 `carrier_hk` 有多筆歷史紀錄 |
| `effective_from` | 該筆紀錄生效時間，取最新一筆（`ROW_NUMBER DESC`）才是當前狀態 |
| `INACCURATE_AVAILABILITY` | 財政部回應代碼 919，驗證碼錯誤 |

### 歷史錯誤版本（勿使用）

```sql
-- ❌ v1：用 barcode 格式判斷，完全錯誤
WHERE hc.barcode LIKE '/%'

-- ❌ v2：沒取最新一筆，歷史所有狀態都算進去
WHERE c.mof_status = 'INACCURATE_AVAILABILITY'

-- ❌ v3：is_active=FALSE 是「已刪除載具」，不是 919
WHERE c.is_active = FALSE AND c.mof_status = 'INACCURATE_AVAILABILITY'
```

---

## 四、回訪定義

- **依據**：`base__sat__session_session_start_activity` table
- **判斷**：趨勢起始日（2026-03-01）後，有任一 `session_start` event

---

## 五、每日更新

- **腳本**：`docs/update_dashboard.py`
- **執行方式**：`python3 docs/update_dashboard.py`
- 自動撈取 BigQuery 最新資料、更新 HTML、push 到 GitHub Pages
