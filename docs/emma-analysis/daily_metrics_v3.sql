-- 每日會員斷點分析 v3（成本優化版）
-- Prototype: 2026-02-01 ~ 2026-02-28

DECLARE report_start DATE DEFAULT '2026-02-01';
DECLARE report_end DATE DEFAULT '2026-02-28';

WITH
date_spine AS (
  SELECT d AS report_date
  FROM UNNEST(GENERATE_DATE_ARRAY(report_start, report_end)) AS d
),

-- ============ 會員（不做 CROSS JOIN，用累計法）============
member_base AS (
  SELECT
    m.member_hk,
    h.member_id,
    m.status,
    CAST(m.created_at AS DATE) AS register_date,
    CAST(m.effective_from AS DATE) AS status_date,
    ROW_NUMBER() OVER (PARTITION BY m.member_hk ORDER BY m.effective_from DESC) AS rn
  FROM `production-379804.base_marts.base__sat__member` m
  JOIN `production-379804.base_marts.base__hub__member` h ON m.member_hk = h.member_hk
),
ml AS (SELECT * FROM member_base WHERE rn = 1),

-- 每日新註冊
daily_reg AS (
  SELECT register_date, COUNT(*) AS cnt FROM ml GROUP BY register_date
),
-- 累計會員用 running sum
member_totals AS (
  SELECT
    ds.report_date,
    SUM(COALESCE(dr.cnt, 0)) OVER (ORDER BY ds.report_date) AS total_member_approx,
    -- 未刪除 = 總會員 - 已停用/刪除的（在 report_date 之前）
  FROM date_spine ds
  LEFT JOIN daily_reg dr ON dr.register_date = ds.report_date
),

-- 每日刪除（status 變更日）
daily_del AS (
  SELECT status_date, COUNT(*) AS cnt 
  FROM ml WHERE status IN ('DEACTIVATED', 'INACTIVE') GROUP BY status_date
),
delete_cumulative AS (
  SELECT
    ds.report_date,
    SUM(COALESCE(dd.cnt, 0)) OVER (ORDER BY ds.report_date) AS total_deleted
  FROM date_spine ds
  LEFT JOIN daily_del dd ON dd.status_date = ds.report_date
),

-- 會員指標合併
member_daily AS (
  SELECT
    ds.report_date,
    (SELECT COUNT(*) FROM ml WHERE register_date <= ds.report_date) AS total_member,
    (SELECT COUNT(*) FROM ml WHERE register_date = ds.report_date) AS new_register_n,
    (SELECT COUNT(*) FROM ml WHERE status IN ('DEACTIVATED','INACTIVE') AND status_date = ds.report_date) AS delete_s,
    (SELECT COUNT(*) FROM ml WHERE register_date <= ds.report_date AND status NOT IN ('DEACTIVATED','INACTIVE')) AS undeleted_e
  FROM date_spine ds
),

-- ============ Policy 有效 ============
-- 先只取在觀察窗口可能有效的 policy（accepted 在過去 180 天內）
policy_relevant AS (
  SELECT 
    member_hk, 
    CAST(effective_from AS DATE) AS accepted_date
  FROM `production-379804.base_marts.base__ma_sat__member_policy_statement`
  WHERE CAST(effective_from AS DATE) BETWEEN DATE_SUB(report_start, INTERVAL 180 DAY) AND report_end
),
policy_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT pe.member_hk) AS policy_valid,
    COUNT(DISTINCT CASE 
      WHEN DATE_ADD(pe.accepted_date, INTERVAL 180 DAY) = ds.report_date THEN pe.member_hk END) AS policy_expired_today,
    COUNT(DISTINCT CASE 
      WHEN DATE_ADD(pe.accepted_date, INTERVAL 180 DAY) BETWEEN ds.report_date AND DATE_ADD(ds.report_date, INTERVAL 30 DAY)
      THEN pe.member_hk END) AS policy_expiring_30d
  FROM date_spine ds
  JOIN policy_relevant pe 
    ON pe.accepted_date <= ds.report_date
    AND DATE_ADD(pe.accepted_date, INTERVAL 180 DAY) > ds.report_date
  GROUP BY ds.report_date
),

-- ============ 載具有效 ============
carrier_valid_members AS (
  SELECT DISTINCT mc.member_hk
  FROM `production-379804.base_marts.base__sat__carrier` c
  JOIN `production-379804.base_marts.base__link__member_carrier` mc ON c.carrier_hk = mc.carrier_hk
  WHERE c.is_active = TRUE
),

-- ============ 發票（只掃需要的日期範圍）============
invoice_relevant AS (
  SELECT
    mi.member_hk,
    CAST(i.issued_at AS DATE) AS invoice_date,
    i.carrier_type
  FROM `production-379804.base_marts.base__sat__invoice` i
  JOIN `production-379804.base_marts.base__link__member_invoice` mi ON i.invoice_hk = mi.invoice_hk
  WHERE CAST(i.issued_at AS DATE) BETWEEN DATE_SUB(report_start, INTERVAL 30 DAY) AND report_end
),
invoice_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT ir.member_hk) AS has_invoice,
    COUNT(DISTINCT CASE WHEN ir.carrier_type IS NOT NULL AND ir.carrier_type != '' THEN ir.member_hk END) AS has_carrier_invoice
  FROM date_spine ds
  JOIN invoice_relevant ir
    ON ir.invoice_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
  GROUP BY ds.report_date
),

-- ============ 活躍（Firebase session_start）============
session_data AS (
  SELECT DISTINCT
    CAST(user_id AS INT64) AS member_id,
    PARSE_DATE('%Y%m%d', REPLACE(_TABLE_SUFFIX, 'intraday_', '')) AS session_date
  FROM `invoice-bfd85.analytics_382839978.events_intraday_*`
  WHERE REPLACE(_TABLE_SUFFIX, 'intraday_', '') 
    BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(report_start, INTERVAL 30 DAY))
        AND FORMAT_DATE('%Y%m%d', report_end)
    AND event_name = 'session_start'
    AND user_id IS NOT NULL AND user_id != ''
),
active_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT sd.member_id) AS active_30d
  FROM date_spine ds
  JOIN session_data sd
    ON sd.session_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
  GROUP BY ds.report_date
),

-- ============ MAVS = 活躍30d + 載具有效 + Policy有效 ============
mavs_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT h.member_hk) AS mavs_total,
    COUNT(DISTINCT CASE WHEN ml2.register_date = ds.report_date THEN h.member_hk END) AS mavs_new
  FROM date_spine ds
  JOIN session_data sd ON sd.session_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
  JOIN `production-379804.base_marts.base__hub__member` h ON h.member_id = sd.member_id
  JOIN carrier_valid_members cv ON cv.member_hk = h.member_hk
  JOIN policy_relevant pe ON pe.member_hk = h.member_hk
    AND pe.accepted_date <= ds.report_date
    AND DATE_ADD(pe.accepted_date, INTERVAL 180 DAY) > ds.report_date
  LEFT JOIN ml ml2 ON ml2.member_hk = h.member_hk
  GROUP BY ds.report_date
),

-- ============ HYVS = 載具有效 + Policy有效 + 近180天有載具發票 ============
hyvs_invoice AS (
  SELECT
    mi.member_hk,
    CAST(i.issued_at AS DATE) AS invoice_date
  FROM `production-379804.base_marts.base__sat__invoice` i
  JOIN `production-379804.base_marts.base__link__member_invoice` mi ON i.invoice_hk = mi.invoice_hk
  WHERE CAST(i.issued_at AS DATE) BETWEEN DATE_SUB(report_start, INTERVAL 180 DAY) AND report_end
    AND i.carrier_type IS NOT NULL AND i.carrier_type != ''
),
hyvs_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT hi.member_hk) AS hyvs_total
  FROM date_spine ds
  JOIN hyvs_invoice hi ON hi.invoice_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 180 DAY) AND ds.report_date
  JOIN carrier_valid_members cv ON cv.member_hk = hi.member_hk
  JOIN policy_relevant pe ON pe.member_hk = hi.member_hk
    AND pe.accepted_date <= ds.report_date
    AND DATE_ADD(pe.accepted_date, INTERVAL 180 DAY) > ds.report_date
  GROUP BY ds.report_date
)

-- ============ 最終輸出 ============
SELECT
  md.report_date AS date,
  md.total_member,
  md.new_register_n,
  md.delete_s,
  md.undeleted_e,
  COALESCE(pd.policy_valid, 0) AS policy_valid,
  (SELECT COUNT(*) FROM carrier_valid_members) AS carrier_valid,
  COALESCE(id.has_invoice, 0) AS has_invoice,
  COALESCE(id.has_carrier_invoice, 0) AS has_carrier_invoice,
  COALESCE(ad.active_30d, 0) AS active_30d,
  COALESCE(mvd.mavs_total, 0) AS mavs_total,
  COALESCE(hd.hyvs_total, 0) AS hyvs_total,
  COALESCE(mvd.mavs_new, 0) AS mavs_new,
  COALESCE(pd.policy_expired_today, 0) AS policy_expired_today,
  COALESCE(pd.policy_expiring_30d, 0) AS policy_expiring_30d,

  -- Rates
  ROUND(SAFE_DIVIDE(COALESCE(pd.policy_valid, 0), md.undeleted_e), 6) AS policy_rate,
  ROUND(SAFE_DIVIDE((SELECT COUNT(*) FROM carrier_valid_members), COALESCE(pd.policy_valid, 0)), 6) AS carrier_rate,
  ROUND(SAFE_DIVIDE(COALESCE(id.has_invoice, 0), (SELECT COUNT(*) FROM carrier_valid_members)), 6) AS invoice_rate,
  ROUND(SAFE_DIVIDE(COALESCE(id.has_carrier_invoice, 0), COALESCE(id.has_invoice, 0)), 6) AS carrier_invoice_rate,
  ROUND(SAFE_DIVIDE(COALESCE(mvd.mavs_total, 0), md.undeleted_e), 6) AS mavs_rate

FROM member_daily md
LEFT JOIN policy_daily pd ON pd.report_date = md.report_date
LEFT JOIN invoice_daily id ON id.report_date = md.report_date
LEFT JOIN active_daily ad ON ad.report_date = md.report_date
LEFT JOIN mavs_daily mvd ON mvd.report_date = md.report_date
LEFT JOIN hyvs_daily hd ON hd.report_date = md.report_date
ORDER BY md.report_date
