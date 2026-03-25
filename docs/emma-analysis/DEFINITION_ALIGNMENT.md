# 指標定義對齊說明

> 整併自 emmaguan-del/invoice-app-analysis，用於對齊 Kirk 的 audience_dashboard 與 Emma 的 HYVS/MAVS dashboard。

---

## 關鍵定義差異與統一

### 919（載具驗證失敗）
| 來源 | 定義 | 正確性 |
|---|---|---|
| Emma dashboard | `is_carrier_bound = true AND is_carrier_active = false` | ✅ 正確 |
| Kirk dashboard（舊） | barcode 以 `/` 開頭 | ❌ 錯誤（已修正） |
| Kirk dashboard（新） | `mof_status = 'INACCURATE_AVAILABILITY'` | ✅ 正確 |

**統一定義**：`mof_status = 'INACCURATE_AVAILABILITY'` 代表財政部回傳驗證碼錯誤，無法同步發票。

---

### 活躍（Active）
| 定義層級 | 說明 |
|---|---|
| MAVS 的「活躍」 | 近 30 天有 `session_start` 紀錄（`base__sat__session_session_start_activity`） |
| `is_member_active`（syncer view） | **不是** 30 天活躍，而是「會員未刪除（status ≠ DEACTIVATED）」|

**Kirk audience dashboard 的活躍**：3/14 快照前 30 天內有 `session_start_activity` 紀錄。✅ 定義正確。

---

### syncer view 欄位語意（`base__computed_sat__verified_syncer`）
| 欄位 | 語意 |
|---|---|
| `is_carrier_bound` | 有綁載具（含 919） |
| `is_carrier_active` | 載具正常（`mof_status = 'SUCCESS'`，排除 919） |
| `is_carrier_bound AND NOT is_carrier_active` | **919 載具** |
| `is_policy_active` | Policy 有效（授權日 + 180 天 > 今天） |
| `is_invoice_active_30d` | 近 30 天有發票 |
| `is_invoice_active_180d` | 近 180 天有發票（HYVS 條件之一） |

---

### HYVS vs MAVS
| 指標 | 定義 |
|---|---|
| HYVS | 載具有效 + Policy 有效 + 近 180 天有載具發票 |
| MAVS | 近 30 天活躍 + 載具有效 + Policy 有效 |

---

## 待整合項目（來自 dashboard_todo.md）
1. **MAVS 週期性**：受對獎週期影響，建議用季度平均評估
2. **新註冊 Cohort + Policy 續約率**
3. **919 恢復 Cohort**：從失效日開始追蹤 D1/D3/D7/D14/D30/D60/D90 恢復比例
4. **Policy 過期 Cohort**：從 D110 軟提醒開始，追蹤完整時間軸

## 資料主要來源
- BQ Project: `production-379804`
- 主要 syncer view: `base_marts.base__computed_sat__verified_syncer`
- Session 活躍: `base_marts.base__sat__session_session_start_activity`
