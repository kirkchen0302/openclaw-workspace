# API ↔ BigQuery 欄位對照表

## Member（會員）
| API 欄位 | BQ 欄位 | 定義 |
|---|---|---|
| `id` | `member_id` (hub) | 會員唯一識別碼 |
| `is_deactivated: true` | `status = 'DEACTIVATED'` | 已刪除帳號 |
| `is_deactivated: false` | `status IN ('EMAIL_VERIFIED','PHONE_CALL_VERIFIED')` | 有效會員 |
| `INACTIVE` | BQ 獨有 | **待確認：可能是系統標記的停用，非用戶主動刪除** |
| `policy_statement_status` | 無直接對應，需從 policy 表計算 | renewed/soft_reminder/expiring_soon/expired/unknown |
| `created_at` | `created_at` | 註冊時間 |

## Policy Statement（授權）
| API 欄位 | BQ 欄位 | 定義 |
|---|---|---|
| 授權時間 | `effective_from` (ma_sat__member_policy_statement) | 每次同意授權的時間 |
| 有效期 | 計算：effective_from + 180 天 | 6個月有效 |
| `renewed` | effective_from + 180天 > 今天 + 70天 | 距到期 >70 天 |
| `soft_reminder` | 到期前 70 天內 | 提醒續約 |
| `expiring_soon` | 到期前 20 天內 | 即將到期 |
| `expired` | effective_from + 180天 < 今天 | 已過期 |

## Carrier（載具）
| API 欄位 | BQ 欄位 | 定義 |
|---|---|---|
| `id` | `carrier_hk` (hash) | 載具唯一識別碼 |
| `barcode` | 無直接對應 | 載具條碼（/開頭的8碼） |
| `is_active` | `is_active` | 載具是否啟用（綁定中） |
| `is_valid` | 無直接對應 | 載具驗證碼是否有效（能否同步財政部） |
| `status: success` | `mof_status = 'SUCCESS'` | 同步財政部成功 |
| `status: failed` | `mof_status = 'INACCURATE_AVAILABILITY'` | 同步失敗（MOF 919 錯誤） |
| `status: inactive` | — | 載具已解除綁定 |
| `status: unknown` | — | 未預期錯誤 |
| `category_name` | `type` | 載具類型（手機條碼、悠遊卡等） |

## Invoice（發票）
| BQ 欄位 | 定義 |
|---|---|
| `invoice_hk` | 發票唯一識別碼 |
| `issued_at` | 發票開立時間 |
| `carrier_type` | 載具類型（3J0002=手機條碼） |
| `total_price` | 金額 |
| `type` | 發票類型（CARRIER=載具發票） |

## 計算邏輯確認
- **刪除 (delete_s)**：status = 'DEACTIVATED' 
- **未刪除 (undeleted_e)**：status != 'DEACTIVATED'（含 INACTIVE）
- **Policy 有效**：最近一次 effective_from + 180天 > report_date
- **載具有效 (carrier_valid)**：is_active = true
- **有發票**：近30天有 invoice 記錄
- **有載具發票**：近30天有 carrier_type 非空的 invoice
- **活躍 (active_30d)**：近30天有 session_start（用 production session 表）
- **MAVS**：活躍 ∩ 載具有效 ∩ Policy有效
- **HYVS**：載具有效 ∩ Policy有效 ∩ 近180天有載具發票
