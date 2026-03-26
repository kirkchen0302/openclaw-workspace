# 產品優化追蹤框架 — 如何驗證優化有效

> 建立日期：2026-03-23
> 基準日期：2026-03-19（所有 baseline 數據來自此日期的 BQ 驗證）

---

## 基準數據快照（優化前）

| 指標 | 基準值 | 說明 |
|---|---:|---|
| 919 存量 | **1,169,283** | 21.2% 的未刪除會員 |
| 919 且沉睡 | **1,043,306** | 89.2% 的 919 用戶不開 App |
| 沉睡但 Policy 有效 | **710,485** | 急需喚回（Policy 正在倒數） |
| 活躍但 Policy 過期 | **64,985** | 有開 App 但沒續約（UX 問題） |
| HYVS | **2,812,983** | 年度目標 500 萬 |
| MAVS | **2,100,975** | 目標 301.7 萬 |
| Policy 有效率 | **54.3%** | |
| setBankAccount D7 919 轉換率 | iOS **21.2%** / Android **15.5%** | 月均 |
| setCarrierBinding D7 919 轉換率 | iOS **13.9%** / Android **8.5%** | 月均 |
| 每月新增 919 | **~107K**（非開獎月）/ **~192K**（開獎月） | |
| 每月修復 919 | **~88K**（非開獎月）/ **~179K**（開獎月） | |
| 修好又壞率 | **85.2%** | |
| 簡訊修復率 | **60.4%**（9.8 萬人樣本） | |

---

## 優化項目與驗證方式

### 優化 A：修復 setBankAccount 密碼同步 bug

> `AddBankWebViewModel`（Android）/ `IBSettingWebViewModel`（iOS）加入 handleResponse 密碼同步

**追蹤指標：**

| 指標 | 基準（優化前） | 目標（優化後） | 計算方式 | 觀察週期 |
|---|---|---|---|---|
| **setBankAccount D0 919 轉換率** | iOS 9.9% / Android 7.2% | **→ <2%** | pageview `setBankAccount` 後當天變 919 的比例 | 上線後 14 天 |
| **setBankAccount D7 919 轉換率** | iOS 21.2% / Android 15.5% | **→ <5%** | pageview 後 7 天內變 919 的比例 | 上線後 30 天 |
| **App 內觸發佔比** | ~20% | **→ <10%** | setBankAccount D7 919 / 全部新增 919 | 上線後 30 天 |

**驗證 SQL：**
```sql
-- 上線日期之後 vs 之前的 D7 轉換率比較
WITH visits AS (
  SELECT ms.member_hk, pv.created_date AS d, pv.platform
  FROM base_marts.base__sat__session_pageview_activity pv
  JOIN base_marts.base__link__member_session ms ON pv.session_hk = ms.session_hk
  WHERE pv.page = 'setBankAccount'
    AND pv.created_date BETWEEN @launch_date AND DATE_ADD(@launch_date, INTERVAL 30 DAY)
),
n919 AS (
  SELECT mc.member_hk, CAST(c.effective_from AS DATE) AS d919
  FROM intermediate.sat__carrier c
  JOIN base_marts.base__link__member_carrier mc ON c.carrier_hk = mc.carrier_hk
  WHERE c.mof_status = 'INACCURATE_AVAILABILITY' AND c.is_active = TRUE
)
SELECT v.platform,
  COUNT(DISTINCT v.member_hk) AS visitors,
  COUNT(DISTINCT CASE WHEN n.d919 BETWEEN v.d AND DATE_ADD(v.d, INTERVAL 7 DAY) THEN v.member_hk END) AS d7_919,
  ROUND(...) AS d7_rate
FROM visits v LEFT JOIN n919 n ON n.member_hk = v.member_hk ...
GROUP BY v.platform
```

**成功標準：** D7 轉換率**下降 75% 以上**（從 ~20% 降到 <5%）。如果只降到 10~15%，代表 WebView 中還有其他密碼修改路徑沒有攔截到。

**注意：** 轉換率不會降到 0%，因為部分用戶可能在 WebView 中忘記密碼→重設→App 同步了新密碼但財政部那邊又改了一次。

---

### 優化 B：修復 setCarrierBinding 密碼同步 bug

> `AddCarrierWebActivity`（Android）/ `IBSettingWebViewVC`（iOS）加入密碼同步

**追蹤指標：** 同優化 A，但改追蹤 `setCarrierBinding` 頁面。

| 指標 | 基準 | 目標 | 觀察週期 |
|---|---|---|---|
| setCarrierBinding D7 919 轉換率 | iOS 13.9% / Android 8.5% | **→ <3%** | 上線後 30 天 |

---

### 優化 C：919 主動推播（FCM）

> server 偵測到 919 後立即推播通知用戶

**追蹤指標：**

| 指標 | 基準 | 目標 | 計算方式 | 觀察週期 |
|---|---|---|---|---|
| **919 存量** | 1,169,283 | **月降 5%+** | syncer `COUNTIF(is_carrier_bound AND NOT is_carrier_active)` 每月快照 | 持續 |
| **919 D7 修復率** | ~N/A（目前無主動推播） | **>40%** | 新變 919 的人中，7 天內恢復 SUCCESS 的比例 | 上線後 30 天 |
| **919 D30 修復率** | — | **>60%** | 同上，30 天窗口 | 上線後 60 天 |
| **推播點擊率** | — | **>15%** | FCM 推播送達 → 點擊 → 開 App 的比例 | 上線後 14 天 |
| **推播後修復完成率** | — | **>50%** | 點擊推播的人中，成功更新密碼的比例 | 上線後 30 天 |

**驗證 SQL：**
```sql
-- 919 D7 修復率（上線後）
WITH new_919 AS (
  SELECT mc.member_hk, CAST(c.effective_from AS DATE) AS d919
  FROM intermediate.sat__carrier c
  JOIN base_marts.base__link__member_carrier mc ON c.carrier_hk = mc.carrier_hk
  WHERE c.mof_status = 'INACCURATE_AVAILABILITY' AND c.is_active = TRUE
    AND CAST(c.effective_from AS DATE) >= @launch_date
),
recovered AS (
  SELECT mc.member_hk, CAST(c.effective_from AS DATE) AS d_ok
  FROM intermediate.sat__carrier c
  JOIN base_marts.base__link__member_carrier mc ON c.carrier_hk = mc.carrier_hk
  WHERE c.mof_status = 'SUCCESS' AND c.is_active = TRUE
)
SELECT
  FORMAT_DATE('%Y-%m', n.d919) AS month,
  COUNT(DISTINCT n.member_hk) AS new_919,
  COUNT(DISTINCT CASE WHEN r.d_ok BETWEEN n.d919 AND DATE_ADD(n.d919, INTERVAL 7 DAY)
    THEN n.member_hk END) AS recovered_d7,
  ROUND(...) AS d7_recovery_rate
FROM new_919 n LEFT JOIN recovered r ON r.member_hk = n.member_hk ...
GROUP BY 1
```

**成功標準：** 919 存量開始**月減 5 萬+**（目前每月新增 ~10 萬、修復 ~8 萬，淨增 ~2 萬）。推播上線後應該讓修復量大幅上升。

---

### 優化 D：擴大 919 簡訊發送

> 將簡訊從 10 萬人擴大到 117 萬人

**追蹤指標：**

| 指標 | 基準（10 萬人試驗） | 目標（全量發送） | 觀察週期 |
|---|---|---|---|
| 簡訊送達率 | 96.9% | 維持 >95% | 發送後 3 天 |
| **修復率** | **60.4%** | **>50%**（大規模可能略降） | 發送後 30 天 |
| 修復人數 | 59,610 | **>500,000** | 發送後 30 天 |
| 919 存量變動 | — | **從 117 萬降到 <70 萬** | 發送後 60 天 |
| 重複發送率 | 3.1%（10 次+有 132 人） | **同號碼 7 天內不重發** | 持續 |
| 修好又壞率 | 85.2% | 追蹤是否下降（配合 bug fix） | 發送後 90 天 |

**驗證 SQL：**
```sql
-- 簡訊修復率追蹤
-- 需要將簡訊發送記錄（電話號碼 + 發送日期）匯入 BQ
-- 然後比對 carrier 狀態從 INACCURATE_AVAILABILITY → SUCCESS 的時間
```

**成功標準：** 919 存量在 60 天內**從 117 萬降到 70 萬以下**。如果 bug fix（優化 A/B）同時上線，修好又壞率應該從 85% 下降。

---

### 優化 E：密碼錯 3 次不導去財政部

> 改用 App 內手機驗證碼重設，避免導去財政部觸發新 919

**追蹤指標：**

| 指標 | 基準 | 目標 | 計算方式 | 觀察週期 |
|---|---|---|---|---|
| **forgetPassword pageview** | 月均 ~2.6% 的 919 觸發來自忘記密碼 | **→ 0** | pageview `forgetPassword` 數量 | 上線後 14 天 |
| **密碼更新成功率** | ~60%（簡訊試驗） | **>70%** | 進入密碼更新頁→成功更新的比例 | 上線後 30 天 |
| **3 次錯誤後的行為** | 100% 導去財政部 | **0% 導去財政部** | forgetPassword pageview from passwordSetting | 上線後 7 天 |

---

### 優化 F：喚回沉睡但 Policy 有效的用戶

> 推播/簡訊喚回 71 萬沉睡但 Policy 有效的人

**追蹤指標：**

| 指標 | 基準 | 目標 | 計算方式 | 觀察週期 |
|---|---|---|---|---|
| **沉睡+Policy有效 人數** | 710,485 | **月降 10%+** | syncer 交叉矩陣 | 持續 |
| **喚回率** | — | **>15%** | 收到推播後 7 天內有 session 的比例 | 推播後 14 天 |
| **喚回→MAVS 轉換率** | — | **>60%** | 喚回的人中，30 天內成為 MAVS 的比例 | 推播後 60 天 |
| **Policy 續約率** | — | **>30%** | 喚回的人中，Policy 到期前成功續約的比例 | 持續 |

**驗證 SQL：**
```sql
-- 沉睡+Policy有效 月度追蹤
WITH active_30d AS (
  SELECT DISTINCT ms.member_hk
  FROM base_marts.base__sat__session_session_start_activity s
  JOIN base_marts.base__link__member_session ms ON s.session_hk = ms.session_hk
  WHERE s.created_date BETWEEN DATE_SUB(@date, INTERVAL 30 DAY) AND @date
)
SELECT
  COUNT(DISTINCT CASE WHEN a.member_hk IS NULL AND vs.is_policy_active
    THEN vs.member_hk END) AS sleeping_policy_valid
FROM base_marts.base__computed_sat__verified_syncer vs
LEFT JOIN active_30d a ON a.member_hk = vs.member_hk
WHERE CAST(vs.effective_from AS DATE) = @date AND vs.is_member_active
```

---

## 綜合追蹤 — HYVS / MAVS 月度目標

所有優化的最終目的是推升 HYVS 和 MAVS。

| 時間 | HYVS 目標 | MAVS 目標 | 驅動因素 |
|---|---|---|---|
| 2026-03（基準） | 2,812,983 | 2,100,975 | — |
| 2026-04 | 2,820,000 | 2,150,000 | 開獎月 + 簡訊修復開始 |
| 2026-05 | 2,850,000 | 2,250,000 | 開獎月效應 + bug fix 上線 |
| 2026-06 | 2,900,000 | 2,150,000 | 非開獎月低谷，但 919 存量下降中 |
| 2026-Q3 | 3,100,000 | 2,400,000 | bug fix 全面生效 + 推播喚回 |
| 2026-Q4 | 3,500,000 | 2,700,000 | 需配合獲客成長 |
| 2026-12 | **5,000,000** | **3,016,711** | 年度目標 |

---

## Dashboard 需新增的追蹤圖表

| # | 圖表 | 數據來源 | 用途 |
|---|---|---|---|
| 1 | **919 D7 轉換率趨勢**（setBankAccount / setCarrierBinding，按平台） | pageview + carrier | 驗證優化 A/B 是否生效 |
| 2 | **919 D7 修復率趨勢** | carrier 狀態變更 | 驗證優化 C/D |
| 3 | **919 存量趨勢**（按平台） | syncer 每日快照 | 綜合追蹤 |
| 4 | **修好又壞率月度趨勢** | carrier 歷史 | 驗證循環是否打破 |
| 5 | **沉睡+Policy有效 人數趨勢** | syncer + session | 驗證優化 F |
| 6 | **活躍+Policy過期 人數趨勢** | syncer + session | 驗證續約 UX 優化 |

---

## 追蹤節奏

| 頻率 | 追蹤內容 |
|---|---|
| **每日** | 919 存量、HYVS、MAVS（Dashboard 自動更新） |
| **每週** | 919 D7 轉換率、修復率、推播點擊率（週會報告） |
| **每月** | 修好又壞率、沉睡+Policy有效 人數、平台拆分（月度回顧） |
| **每季** | HYVS/MAVS vs 目標差距、優化 ROI 評估 |

---

## 判定邏輯

### 優化有效的信號

1. **setBankAccount D7 919 轉換率下降 >75%** — bug fix 有效
2. **919 存量開始月減 >5 萬** — 修復速度超過新增速度
3. **修好又壞率從 85% 下降到 <60%** — 循環被打破
4. **HYVS 月增 >2 萬**（目前月增 ~5K） — 綜合效果顯現

### 優化無效的信號

1. **D7 轉換率只降 <30%** — WebView 中有其他未攔截的密碼修改路徑
2. **919 存量持平或上升** — App 外觸發量未解決，需加速推播
3. **修好又壞率仍 >80%** — 對獎循環沒被打破，需考慮 Policy 自動續約或領獎原生化
4. **喚回推播點擊率 <5%** — 推播文案或時機需調整

### 需要重新評估策略的門檻

- 如果 bug fix（A/B）上線 30 天後 919 月新增量仍 >8 萬 → 80% App 外來源比預期更頑固，需加速推播+領獎原生化
- 如果簡訊全量發送後 60 天 919 存量仍 >100 萬 → 修復率可能低於試驗期，需調查原因
- 如果 HYVS 到 Q3 仍 <320 萬 → 僅靠既有會員修復不夠，需加大獲客投入
