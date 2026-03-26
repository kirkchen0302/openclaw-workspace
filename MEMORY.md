# MEMORY.md — 長期記憶

## 用戶
- **名字**：Kirk Chen
- **手機**：8009797062（Telegram）
- **公司**：麻布數據科技
- **角色**：PM

---

## 重要業務定義

### 919 載具（手機載具驗證失敗）
- **意義**：財政部回應代碼 919，該會員手機載具驗證碼錯誤，無法同步發票。
- **`is_active`**：載具條碼是否存在，`FALSE` = 已刪除，不算 919
- **`mof_status`**：sat__carrier 有多筆歷史，需取最新一筆（ROW_NUMBER + effective_from DESC）
- **正確 BQ 判斷（最終版）**：
  ```sql
  JOIN (
    SELECT carrier_hk, is_active, mof_status,
      ROW_NUMBER() OVER (PARTITION BY carrier_hk ORDER BY effective_from DESC) AS rn
    FROM `production-379804.intermediate.sat__carrier`
  ) c ON lmc.carrier_hk = c.carrier_hk
  WHERE c.rn = 1
    AND c.is_active = TRUE
    AND c.mof_status = 'INACCURATE_AVAILABILITY'
  ```
- ❌ 舊錯誤：`barcode LIKE '/%'`、沒取最新一筆、`is_active = FALSE`

### 活躍使用者
- **定義**：有 `session_start` event 即視為活躍，不參考其他 event
- **BQ 來源**：`base__sat__session_session_start_activity`

---

## 進行中專案

### audience_dashboard（受眾回訪分析）
- **檔案**：`docs/audience_dashboard.html`、`docs/update_dashboard.py`
- **每日更新**：跑 `update_dashboard.py`，自動 git push 到 GitHub Pages
- **快照基準**：2026-03-22（固定）
- **趨勢起始**：2026-03-01
- **四群**：iOS 活躍/未活躍 × Android 活躍/未活躍（以快照基準前 30 天 session_start 判斷）
- **BQ 專案**：`production-379804`
- **修正紀錄（2026-03-26）**：919 判斷從 barcode 改為 `mof_status = 'INACCURATE_AVAILABILITY'`

### invoice-prototype（發票存摺 App Prototype）
- **URL**：https://pm-prototype-a75ce.web.app
- **Firebase 專案**：pm-prototype-a75ce
- **RTDB URL**：https://pm-prototype-a75ce-default-rtdb.asia-southeast1.firebasedatabase.app
- **repo**：https://github.com/kirkchen0302/openclaw-workspace（`invoice-prototype/` 目錄）

---

## BigQuery 連線
- **project**：production-379804
- **venv**：`/Users/kirk/.openclaw/workspace/.venv`
- **credentials**：`/Users/kirk/.openclaw/workspace/.gcp/adc.json`（refresh_token 方式）
- 使用：`cd /Users/kirk/.openclaw/workspace && source .venv/bin/activate && python3 ...`

---

## 待辦
- [ ] 客服信件和合規信件的 email 上傳檔案確認（找 Angela）
