# 2026-03 開獎推播計畫與效果追蹤

> 開獎日：2026-03-25（開 2026 年 1-2 月發票）
> 推播計畫由團隊制定，本文件記錄計畫內容 + 數據追蹤

---

## 一、推播計畫

### 三階段推播

| 階段 | 時間 | 對象 | 預估人數 | 說明 |
|---|---|---|---|---|
| **1. 開獎前召回** | 3/23 14:00 | **全部用戶** | ~310 萬 | 全發 |
| **2. 開獎當日** | 3/25 雲端獎開獎後 | **iOS>30 + Android** | ~236 萬 | 排除 iOS<30（iOS 近 30 天未活躍） |
| **3. 開獎隔天** | 3/26~3/28 | 視情況補發 iOS<30 | ~83 萬 | 觀察 iOS<30 自然回訪後決定 |

### 推播對象拆分（基準：3/23）

| 群組 | 定義 | 人數 |
|---|---:|---|
| **iOS>30（近 30 天活躍）** | 2/21~3/23 有 iOS session | **1,831,764** |
| **iOS<30（近 30 天未活躍）** | 有 iOS session 歷史但近 30 天沒開 | **826,891** |
| **Android（近 30 天活躍）** | 2/21~3/23 有 Android session | **528,001** |
| **合計（第 1 階段全發）** | | **~3,186,656** |
| 第 2 階段（排除 iOS<30） | iOS>30 + Android | **~2,359,765** |

---

## 二、上次開獎（1/25）回訪數據 — 作為 benchmark

### iOS 近 30 天活躍用戶的累計回訪率

| 截至日期 | 距開獎 | 累計回訪人數 | **累計回訪率** |
|---|---|---:|---:|
| 1/25（開獎日） | D0 | 1,016,338 | **55.2%** |
| 1/26 | D1 | 1,240,267 | **67.4%** |
| 1/27 | D2 | 1,324,362 | **72.0%** |
| **1/28** | **D3** | **1,378,750** | **74.9%** |
| 1/29 | D4 | 1,427,210 | 77.5% |
| 1/30 | D5 | 1,458,326 | 79.2% |
| 1/31 | D6 | 1,483,974 | 80.6% |
| 2/01 | D7 | 1,506,790 | 81.9% |
| 2/03 | D9 | 1,541,238 | 83.7% |
| **2/05** | **D11** | **1,573,834** | **85.5%** |

> 基準：iOS 近 30 天活躍 = 1,840,535 人

### 平台比較（D0~D3 回訪率）

| 平台 | 近 30 天活躍 | D3 回訪 | D3 回訪率 |
|---|---:|---:|---:|
| iOS | 1,840,535 | 1,381,671 | **75.1%** |
| Android | 514,734 | 384,231 | **74.6%** |

**iOS 和 Android 的 D3 回訪率幾乎相同（~75%）。**

### 關鍵 benchmark

- **D3 回訪率 ~75%**：開獎後 3 天內，3/4 的近 30 天活躍用戶會自然回來
- **D11 回訪率 ~86%**：到第 11 天才達到 86%（你提到的數字可能是 D11 左右）
- **剩餘 ~14% 在開獎後 11 天內都沒回來**

---

## 三、追蹤指標

### 第 1 階段：開獎前召回（3/23 全發 310 萬）

| 指標 | 計算方式 | 追蹤時間 |
|---|---|---|
| 推播送達率 | 送達數 / 發送數 | 3/23 當天 |
| **3/23~3/24 回訪率** | 3/23~3/24 有 session / 310 萬 | 3/24 |
| 各群組回訪率 | 分 iOS>30 / iOS<30 / Android | 3/24 |

### 第 2 階段：開獎當日（3/25，排除 iOS<30）

| 指標 | 計算方式 | 追蹤時間 |
|---|---|---|
| **開獎日 DAU** | 3/25 有 session 的不重複用戶 | 3/25 |
| vs 上次開獎日 DAU | 對比 1/25 的 DAU | 3/25 |
| iOS<30 自然回訪率 | 3/25 iOS<30 中有 session 的比例 | 3/25 |

### 第 3 階段：觀察 iOS<30（3/26~3/28）

| 指標 | 計算方式 | 判斷標準 |
|---|---|---|
| **iOS<30 累計回訪率** | 3/25~3/28 有 session / 82.7 萬 | |
| 是否需要補發 | 如果 D3 回訪率 < 上次 benchmark 的 75% | 低於 benchmark 就補發 |
| 補發後增量 | 補發後 vs 補發前的回訪增量 | |

### 綜合追蹤

| 指標 | benchmark（1/25） | 目標（3/25） | 追蹤週期 |
|---|---|---|---|
| 開獎日 DAU | — | 高於上次 | D0 |
| **iOS>30 D3 回訪率** | **75.1%** | **≥75%** | D3 (3/28) |
| **Android D3 回訪率** | **74.6%** | **≥75%** | D3 (3/28) |
| **iOS<30 自然 D3 回訪率** | N/A（上次沒有排除） | 觀察 | D3 (3/28) |
| 全體 D7 回訪率 | 81.9% | ≥82% | D7 (4/1) |

---

## 四、追蹤 SQL

### 開獎後每日回訪率（3/25 後跑）

```sql
-- 3/25 開獎後，各群組累計回訪率
WITH ios_active AS (
  SELECT DISTINCT ms.member_hk
  FROM `production-379804.base_marts.base__sat__session_session_start_activity` s
  JOIN `production-379804.base_marts.base__link__member_session` ms ON s.session_hk = ms.session_hk
  WHERE s.created_date BETWEEN DATE_SUB(DATE "2026-03-25", INTERVAL 30 DAY) AND DATE "2026-03-24"
    AND s.platform = 'IOS'
),
ios_inactive AS (
  SELECT DISTINCT ms.member_hk
  FROM `production-379804.base_marts.base__sat__session_session_start_activity` s
  JOIN `production-379804.base_marts.base__link__member_session` ms ON s.session_hk = ms.session_hk
  WHERE s.platform = 'IOS'
    AND ms.member_hk NOT IN (SELECT member_hk FROM ios_active)
),
android_active AS (
  SELECT DISTINCT ms.member_hk
  FROM `production-379804.base_marts.base__sat__session_session_start_activity` s
  JOIN `production-379804.base_marts.base__link__member_session` ms ON s.session_hk = ms.session_hk
  WHERE s.created_date BETWEEN DATE_SUB(DATE "2026-03-25", INTERVAL 30 DAY) AND DATE "2026-03-24"
    AND s.platform = 'ANDROID'
),
returned AS (
  SELECT DISTINCT ms.member_hk, s.created_date AS return_date
  FROM `production-379804.base_marts.base__sat__session_session_start_activity` s
  JOIN `production-379804.base_marts.base__link__member_session` ms ON s.session_hk = ms.session_hk
  WHERE s.created_date BETWEEN DATE "2026-03-25" AND DATE "2026-04-05"
),
check_dates AS (
  SELECT d FROM UNNEST(GENERATE_DATE_ARRAY(DATE "2026-03-25", DATE "2026-04-05")) AS d
)
SELECT
  cd.d AS check_date,
  -- iOS>30
  (SELECT COUNT(DISTINCT ia.member_hk) FROM ios_active ia JOIN returned r ON r.member_hk = ia.member_hk WHERE r.return_date <= cd.d) AS ios_active_returned,
  (SELECT COUNT(*) FROM ios_active) AS ios_active_base,
  -- iOS<30
  (SELECT COUNT(DISTINCT ii.member_hk) FROM ios_inactive ii JOIN returned r ON r.member_hk = ii.member_hk WHERE r.return_date <= cd.d) AS ios_inactive_returned,
  (SELECT COUNT(*) FROM ios_inactive) AS ios_inactive_base,
  -- Android
  (SELECT COUNT(DISTINCT aa.member_hk) FROM android_active aa JOIN returned r ON r.member_hk = aa.member_hk WHERE r.return_date <= cd.d) AS android_returned,
  (SELECT COUNT(*) FROM android_active) AS android_base
FROM check_dates cd
ORDER BY cd.d
```

---

## 五、決策點

| 時間 | 決策 | 依據 |
|---|---|---|
| **3/25 晚上** | iOS<30 是否自然回來？ | 如果開獎日回訪率 >20% 就觀察，<10% 就提前補發 |
| **3/28** | 是否補發 iOS<30？ | D3 累計回訪率 vs 75% benchmark |
| **4/1** | 效果評估 | D7 全體回訪率 vs 82% benchmark |
