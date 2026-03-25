# 發票 App 會員數據 Schema

## GCP 專案
- production-379804
- invoice-bfd85
- 資料來源：BigQuery + Firebase Analytics
- 平台：iOS / Android

## 核心欄位

| 欄位 | 定義 |
|---|---|
| date | 日期（YYYY-MM-DD）|
| platform | ios 或 android |
| total_member | 當日累計會員總數（扣除刪除）|
| new_register_n | 當日新註冊會員數 |
| delete_s | 當日刪除帳號數 |
| undeleted_e | 當日未刪除會員數（實際有效會員母體）|
| mavs_total | 當日 MAVS 總數（近30日活躍、載具有效、Policy有效）|
| hyvs_total | 當日 HYVS 總數（載具有效、Policy有效、近180天有載具發票）|
| mavs_new | 當日新增 MAVS（新註冊後成為MAVS）|
| mavs_recall | 當日喚回 MAVS（非MAVS→MAVS，非當日註冊）|
| mavs_churn | 當日流失 MAVS（MAVS→非MAVS）|
| policy_valid | 當日 Policy 有效會員數 |
| carrier_valid | 當日載具有效會員數 |
| has_invoice | 當日有發票會員數（近30天）|
| has_carrier_invoice | 當日有載具發票會員數（近30天）|
| policy_expired_today | 當日 Policy 到期人數 |
| policy_expiring_30d | 未來30天 Policy 即將到期人數 |
| policy_renewed_7d | 今日完成新授權且過去7天內到期的用戶數 |
| fcm_invalid | 當日 FCM 失效人數 |
| fcm_invalid_cumulative | 累計 FCM 失效人數 |

## 驗算欄位

| 欄位 | 定義 |
|---|---|
| net_increase_n_minus_s | 當日淨增加（新註冊 - 刪除）|
| check_delete_equals_total_minus_e | 累計會員 - 未刪除 = 刪除數 |
| check_net_equals_n_minus_s_diff | 淨增加驗算（應為0）|
| check_total_link_expected | 本期累計 = 前期累計 + 淨增加 |
| mavs_delta | MAVS 淨變動（新增 + 喚回 - 流失）|
| mavs_expected | 預期 MAVS（昨日 + 淨變動）|
| mavs_check_diff | 實際 - 預期 MAVS（應為0）|

## 每日追蹤指標

| 欄位 | 定義 |
|---|---|
| policy_rate | Policy有效率 = policy_valid / undeleted_e |
| carrier_rate | 載具滲透率 = carrier_valid / policy_valid |
| invoice_rate | 發票產生率 = has_invoice / carrier_valid |
| carrier_invoice_rate | 載具發票比例 = has_carrier_invoice / has_invoice |
| mavs_rate | MAVS滲透率 = mavs_total / undeleted_e |
| d_policy_rate | Policy有效率日變動 |
| d_carrier_rate | 載具滲透率日變動 |
| d_invoice_rate | 發票產生率日變動 |
| renew_success_rate | 續授權成功率 = policy_renewed_7d / policy_expired_today |
| policy_impact | Policy變動對母體影響 |
| carrier_impact | 載具滲透變動對母體影響 |
| invoice_impact | 發票產生率變動對母體影響 |
| recall_rate | 喚回率 = mavs_recall / 昨日mavs |
| churn_rate | 流失率 = mavs_churn / 昨日mavs |

## 核心漏斗

```
註冊 → 未刪除(undeleted_e) → Policy有效 → 載具有效 → 有發票 → MAVS
```
