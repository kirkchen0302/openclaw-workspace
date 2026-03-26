-- 每日會員斷點分析 Prototype（2026-02-01 ~ 2026-02-28）
-- 用原始資料，避免 CROSS JOIN 爆炸

DECLARE report_start DATE DEFAULT '2026-02-01';
DECLARE report_end DATE DEFAULT '2026-02-28';

WITH
date_spine AS (
  SELECT d AS report_date
  FROM UNNEST(GENERATE_DATE_ARRAY(report_start, report_end)) AS d
),

-- 會員（取每位最新狀態 + 註冊日期）
members AS (
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
ml AS (
  SELECT * FROM members WHERE rn = 1
),

-- ============ 每日會員數（用累計邏輯）============
-- 新註冊：register_date = report_date
daily_register AS (
  SELECT register_date AS report_date, COUNT(*) AS new_register_n
  FROM ml
  GROUP BY register_date
),
-- 刪除/停用
daily_delete AS (
  SELECT status_date AS report_date, COUNT(*) AS delete_s
  FROM ml
  WHERE status IN ('DEACTIVATED', 'INACTIVE')
  GROUP BY status_date
),

-- ============ Policy 有效（每日）============
-- 每次授權有效 180 天
policy_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT pe.member_hk) AS policy_valid,
    -- 當日到期
    COUNT(DISTINCT CASE 
      WHEN DATE_ADD(CAST(pe.effective_from AS DATE), INTERVAL 180 DAY) = ds.report_date 
      THEN pe.member_hk END) AS policy_expired_today,
    -- 未來30天到期
    COUNT(DISTINCT CASE 
      WHEN DATE_ADD(CAST(pe.effective_from AS DATE), INTERVAL 180 DAY) BETWEEN ds.report_date AND DATE_ADD(ds.report_date, INTERVAL 30 DAY)
      THEN pe.member_hk END) AS policy_expiring_30d
  FROM date_spine ds
  CROSS JOIN (
    SELECT member_hk, CAST(effective_from AS DATE) AS effective_from
    FROM `production-379804.base_marts.base__ma_sat__member_policy_statement`
  ) pe
  WHERE pe.effective_from <= ds.report_date
    AND DATE_ADD(pe.effective_from, INTERVAL 180 DAY) > ds.report_date
  GROUP BY ds.report_date
),

-- ============ 載具有效（快照，非時間序列）============
carrier_valid_members AS (
  SELECT DISTINCT mc.member_hk
  FROM `production-379804.base_marts.base__sat__carrier` c
  JOIN `production-379804.base_marts.base__link__member_carrier` mc ON c.carrier_hk = mc.carrier_hk
  WHERE c.is_active = TRUE
),

-- ============ 發票（每日：近30天有發票）============
invoice_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT mi.member_hk) AS has_invoice,
    COUNT(DISTINCT CASE WHEN i.carrier_type IS NOT NULL AND i.carrier_type != '' THEN mi.member_hk END) AS has_carrier_invoice
  FROM date_spine ds
  JOIN `production-379804.base_marts.base__sat__invoice` i
    ON CAST(i.issued_at AS DATE) BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
  JOIN `production-379804.base_marts.base__link__member_invoice` mi ON i.invoice_hk = mi.invoice_hk
  GROUP BY ds.report_date
),

-- ============ 活躍（Firebase session_start，近30日）============
session_daily AS (
  SELECT
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
  JOIN session_daily sd
    ON sd.session_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
  GROUP BY ds.report_date
),

-- ============ MAVS（member-level：活躍 + 載具有效 + Policy有效）============
mavs_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT h.member_hk) AS mavs_total,
    -- 新增 MAVS（註冊日 = 今天）
    COUNT(DISTINCT CASE WHEN ml2.register_date = ds.report_date THEN h.member_hk END) AS mavs_new
  FROM date_spine ds
  -- 活躍（近30日有 session）
  JOIN session_daily sd ON sd.session_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
  JOIN `production-379804.base_marts.base__hub__member` h ON h.member_id = sd.member_id
  -- 載具有效
  JOIN carrier_valid_members cv ON cv.member_hk = h.member_hk
  -- Policy 有效
  JOIN (
    SELECT member_hk, CAST(effective_from AS DATE) AS eff_date
    FROM `production-379804.base_marts.base__ma_sat__member_policy_statement`
  ) pe ON pe.member_hk = h.member_hk
    AND pe.eff_date <= ds.report_date
    AND DATE_ADD(pe.eff_date, INTERVAL 180 DAY) > ds.report_date
  -- 加入 member info
  JOIN ml ml2 ON ml2.member_hk = h.member_hk
  GROUP BY ds.report_date
),

-- ============ HYVS（載具有效 + Policy有效 + 近180天有載具發票）============
hyvs_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT mi.member_hk) AS hyvs_total
  FROM date_spine ds
  JOIN `production-379804.base_marts.base__sat__invoice` i
    ON CAST(i.issued_at AS DATE) BETWEEN DATE_SUB(ds.report_date, INTERVAL 180 DAY) AND ds.report_date
    AND i.carrier_type IS NOT NULL AND i.carrier_type != ''
  JOIN `production-379804.base_marts.base__link__member_invoice` mi ON i.invoice_hk = mi.invoice_hk
  -- 載具有效
  JOIN carrier_valid_members cv ON cv.member_hk = mi.member_hk
  -- Policy 有效
  JOIN (
    SELECT member_hk, CAST(effective_from AS DATE) AS eff_date
    FROM `production-379804.base_marts.base__ma_sat__member_policy_statement`
  ) pe ON pe.member_hk = mi.member_hk
    AND pe.eff_date <= ds.report_date
    AND DATE_ADD(pe.eff_date, INTERVAL 180 DAY) > ds.report_date
  GROUP BY ds.report_date
),

-- ============ 組裝總表 ============
-- 先算累計會員數
member_cumulative AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT CASE WHEN ml2.register_date <= ds.report_date THEN ml2.member_hk END) AS total_member,
    COUNT(DISTINCT CASE WHEN ml2.register_date <= ds.report_date 
      AND ml2.status NOT IN ('DEACTIVATED', 'INACTIVE') THEN ml2.member_hk END) AS undeleted_e
  FROM date_spine ds
  CROSS JOIN ml ml2
  WHERE ml2.register_date <= ds.report_date
  GROUP BY ds.report_date
),
carrier_valid_count AS (
  SELECT COUNT(DISTINCT member_hk) AS carrier_valid FROM carrier_valid_members
)

SELECT
  mc.report_date AS date,
  mc.total_member,
  COALESCE(dr.new_register_n, 0) AS new_register_n,
  COALESCE(dd.delete_s, 0) AS delete_s,
  mc.undeleted_e,
  COALESCE(pd.policy_valid, 0) AS policy_valid,
  cvc.carrier_valid,
  COALESCE(id.has_invoice, 0) AS has_invoice,
  COALESCE(id.has_carrier_invoice, 0) AS has_carrier_invoice,
  COALESCE(ad.active_30d, 0) AS active_30d,
  COALESCE(md.mavs_total, 0) AS mavs_total,
  COALESCE(hd.hyvs_total, 0) AS hyvs_total,
  COALESCE(md.mavs_new, 0) AS mavs_new,
  COALESCE(pd.policy_expired_today, 0) AS policy_expired_today,
  COALESCE(pd.policy_expiring_30d, 0) AS policy_expiring_30d,

  -- Rates
  SAFE_DIVIDE(COALESCE(pd.policy_valid, 0), mc.undeleted_e) AS policy_rate,
  SAFE_DIVIDE(cvc.carrier_valid, COALESCE(pd.policy_valid, 0)) AS carrier_rate,
  SAFE_DIVIDE(COALESCE(id.has_invoice, 0), cvc.carrier_valid) AS invoice_rate,
  SAFE_DIVIDE(COALESCE(id.has_carrier_invoice, 0), COALESCE(id.has_invoice, 0)) AS carrier_invoice_rate,
  SAFE_DIVIDE(COALESCE(md.mavs_total, 0), mc.undeleted_e) AS mavs_rate

FROM member_cumulative mc
CROSS JOIN carrier_valid_count cvc
LEFT JOIN daily_register dr ON dr.report_date = mc.report_date
LEFT JOIN daily_delete dd ON dd.report_date = mc.report_date
LEFT JOIN policy_daily pd ON pd.report_date = mc.report_date
LEFT JOIN invoice_daily id ON id.report_date = mc.report_date
LEFT JOIN active_daily ad ON ad.report_date = mc.report_date
LEFT JOIN mavs_daily md ON md.report_date = mc.report_date
LEFT JOIN hyvs_daily hd ON hd.report_date = mc.report_date
ORDER BY mc.report_date
