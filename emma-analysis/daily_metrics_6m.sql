-- 每日會員斷點分析（6個月：2025-09-01 ~ 2026-02-28）
-- 使用 intermediate 層 + 分區過濾

DECLARE report_start DATE DEFAULT '2025-10-01';
DECLARE report_end DATE DEFAULT '2026-04-05';

WITH
date_spine AS (
  SELECT d AS report_date
  FROM UNNEST(GENERATE_DATE_ARRAY(report_start, report_end)) AS d
),

-- ============ 會員 ============
member_raw AS (
  SELECT
    m.member_hk,
    h.member_id,
    m.status,
    CAST(m.created_at AS DATE) AS register_date,
    CAST(m.effective_from AS DATE) AS status_date,
    ROW_NUMBER() OVER (PARTITION BY m.member_hk ORDER BY m.effective_from DESC) AS rn
  FROM `production-379804.intermediate.sat__member` m
  JOIN `production-379804.base_marts.base__hub__member` h ON m.member_hk = h.member_hk
),
ml AS (SELECT * FROM member_raw WHERE rn = 1),

-- 預聚合：每日新註冊 / 每日刪除
daily_reg_agg AS (
  SELECT register_date AS d, COUNT(*) AS n FROM ml GROUP BY register_date
),
daily_del_agg AS (
  SELECT status_date AS d, COUNT(*) AS n FROM ml WHERE status IN ('DEACTIVATED','INACTIVE') GROUP BY status_date
),
-- 總會員 = 到 report_start 前的累計 + running sum
member_before_start AS (
  SELECT COUNT(*) AS cnt FROM ml WHERE register_date < report_start
),
deleted_before_start AS (
  SELECT COUNT(*) AS cnt FROM ml WHERE status IN ('DEACTIVATED','INACTIVE') AND status_date < report_start
),
daily_member AS (
  SELECT
    ds.report_date,
    (SELECT cnt FROM member_before_start) 
      + SUM(COALESCE(dr.n, 0)) OVER (ORDER BY ds.report_date) AS total_member,
    COALESCE(dr.n, 0) AS new_register_n,
    COALESCE(dd.n, 0) AS delete_s,
    (SELECT cnt FROM member_before_start) 
      + SUM(COALESCE(dr.n, 0)) OVER (ORDER BY ds.report_date)
      - (SELECT cnt FROM deleted_before_start)
      - SUM(COALESCE(dd.n, 0)) OVER (ORDER BY ds.report_date) AS undeleted_e
  FROM date_spine ds
  LEFT JOIN daily_reg_agg dr ON dr.d = ds.report_date
  LEFT JOIN daily_del_agg dd ON dd.d = ds.report_date
),

-- ============ Policy（分區過濾：report_start - 180d ~ report_end）============
policy_src AS (
  SELECT member_hk, CAST(effective_from AS DATE) AS accepted_date
  FROM `production-379804.intermediate.ma_sat__member_policy_statement`
  WHERE CAST(effective_from AS DATE) BETWEEN 
    DATE_SUB(report_start, INTERVAL 180 DAY) 
    AND report_end
),
policy_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT p.member_hk) AS policy_valid,
    COUNT(DISTINCT CASE 
      WHEN DATE_ADD(p.accepted_date, INTERVAL 180 DAY) = ds.report_date THEN p.member_hk END) AS policy_expired_today,
    COUNT(DISTINCT CASE 
      WHEN DATE_ADD(p.accepted_date, INTERVAL 180 DAY) BETWEEN ds.report_date AND DATE_ADD(ds.report_date, INTERVAL 30 DAY)
      THEN p.member_hk END) AS policy_expiring_30d,
    -- 續授權：今日新授權 且 過去7天內有到期
    COUNT(DISTINCT CASE
      WHEN p.accepted_date = ds.report_date
        AND EXISTS (
          SELECT 1 FROM policy_src p2 
          WHERE p2.member_hk = p.member_hk 
            AND DATE_ADD(p2.accepted_date, INTERVAL 180 DAY) BETWEEN DATE_SUB(ds.report_date, INTERVAL 7 DAY) AND ds.report_date
            AND p2.accepted_date != p.accepted_date
        )
      THEN p.member_hk END) AS policy_renewed_7d
  FROM date_spine ds
  JOIN policy_src p 
    ON p.accepted_date <= ds.report_date
    AND DATE_ADD(p.accepted_date, INTERVAL 180 DAY) > ds.report_date
  GROUP BY ds.report_date
),

-- ============ 載具有效（最新快照）============
carrier_valid AS (
  SELECT DISTINCT mc.member_hk
  FROM `production-379804.intermediate.sat__carrier` c
  JOIN `production-379804.base_marts.base__link__member_carrier` mc ON c.carrier_hk = mc.carrier_hk
  WHERE c.is_active = TRUE
),

-- ============ 發票（分區：report_start - 180d ~ report_end）============
invoice_src AS (
  SELECT
    mi.member_hk,
    CAST(i.issued_at AS DATE) AS invoice_date,
    i.carrier_type
  FROM `production-379804.intermediate.sat__invoice` i
  JOIN `production-379804.base_marts.base__link__member_invoice` mi ON i.invoice_hk = mi.invoice_hk
  WHERE CAST(i.issued_at AS DATE) BETWEEN 
    DATE_SUB(report_start, INTERVAL 180 DAY) 
    AND report_end
),
-- 近30天有發票
invoice_30d AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT inv.member_hk) AS has_invoice,
    COUNT(DISTINCT CASE WHEN inv.carrier_type IS NOT NULL AND inv.carrier_type != '' THEN inv.member_hk END) AS has_carrier_invoice
  FROM date_spine ds
  JOIN invoice_src inv
    ON inv.invoice_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
  GROUP BY ds.report_date
),

-- ============ 活躍（production session_start，近30日）============
sessions AS (
  SELECT DISTINCT
    ms.member_hk,
    sa.created_date AS session_date
  FROM `production-379804.base_marts.base__sat__session_session_start_activity` sa
  JOIN `production-379804.base_marts.base__link__member_session` ms
    ON sa.session_hk = ms.session_hk
  WHERE sa.created_date BETWEEN DATE_SUB(report_start, INTERVAL 30 DAY) AND report_end
),
active_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT s.member_hk) AS active_30d
  FROM date_spine ds
  JOIN sessions s ON s.session_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
  GROUP BY ds.report_date
),

-- ============ MAVS（活躍30d ∩ 載具有效 ∩ Policy有效）============
-- 為了算 mavs_recall / mavs_churn，需要 member-level 的每日 MAVS 狀態
mavs_member_daily AS (
  SELECT DISTINCT
    ds.report_date,
    s.member_hk,
    ml2.register_date
  FROM date_spine ds
  JOIN sessions s ON s.session_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
  JOIN carrier_valid cv ON cv.member_hk = s.member_hk
  JOIN policy_src p ON p.member_hk = s.member_hk
    AND p.accepted_date <= ds.report_date
    AND DATE_ADD(p.accepted_date, INTERVAL 180 DAY) > ds.report_date
  LEFT JOIN ml ml2 ON ml2.member_hk = s.member_hk
),
mavs_agg AS (
  SELECT
    report_date,
    COUNT(DISTINCT member_hk) AS mavs_total,
    COUNT(DISTINCT CASE WHEN register_date = report_date THEN member_hk END) AS mavs_new
  FROM mavs_member_daily
  GROUP BY report_date
),
-- mavs_recall: 今天是 MAVS，昨天不是，且不是今天註冊
mavs_recall AS (
  SELECT
    t.report_date,
    COUNT(DISTINCT t.member_hk) AS mavs_recall
  FROM mavs_member_daily t
  LEFT JOIN mavs_member_daily y ON y.member_hk = t.member_hk AND y.report_date = DATE_SUB(t.report_date, INTERVAL 1 DAY)
  WHERE y.member_hk IS NULL
    AND t.register_date != t.report_date
  GROUP BY t.report_date
),
-- mavs_churn: 昨天是 MAVS，今天不是
mavs_churn AS (
  SELECT
    DATE_ADD(y.report_date, INTERVAL 1 DAY) AS report_date,
    COUNT(DISTINCT y.member_hk) AS mavs_churn
  FROM mavs_member_daily y
  LEFT JOIN mavs_member_daily t ON t.member_hk = y.member_hk AND t.report_date = DATE_ADD(y.report_date, INTERVAL 1 DAY)
  WHERE t.member_hk IS NULL
    AND DATE_ADD(y.report_date, INTERVAL 1 DAY) <= report_end
  GROUP BY report_date
),

-- ============ HYVS（載具有效 ∩ Policy有效 ∩ 近180天有載具發票）============
hyvs_daily AS (
  SELECT
    ds.report_date,
    COUNT(DISTINCT inv.member_hk) AS hyvs_total
  FROM date_spine ds
  JOIN invoice_src inv 
    ON inv.invoice_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 180 DAY) AND ds.report_date
    AND inv.carrier_type IS NOT NULL AND inv.carrier_type != ''
  JOIN carrier_valid cv ON cv.member_hk = inv.member_hk
  JOIN policy_src p ON p.member_hk = inv.member_hk
    AND p.accepted_date <= ds.report_date
    AND DATE_ADD(p.accepted_date, INTERVAL 180 DAY) > ds.report_date
  GROUP BY ds.report_date
)

-- ============ 最終輸出 ============
SELECT
  dm.report_date AS date,
  dm.total_member,
  dm.new_register_n,
  dm.delete_s,
  dm.undeleted_e,
  
  COALESCE(ma.mavs_total, 0) AS mavs_total,
  COALESCE(hd.hyvs_total, 0) AS hyvs_total,
  COALESCE(ma.mavs_new, 0) AS mavs_new,
  COALESCE(mr.mavs_recall, 0) AS mavs_recall,
  COALESCE(mc.mavs_churn, 0) AS mavs_churn,
  
  COALESCE(pd.policy_valid, 0) AS policy_valid,
  (SELECT COUNT(*) FROM carrier_valid) AS carrier_valid,
  COALESCE(i30.has_invoice, 0) AS has_invoice,
  COALESCE(i30.has_carrier_invoice, 0) AS has_carrier_invoice,
  
  COALESCE(pd.policy_expired_today, 0) AS policy_expired_today,
  COALESCE(pd.policy_expiring_30d, 0) AS policy_expiring_30d,
  COALESCE(pd.policy_renewed_7d, 0) AS policy_renewed_7d,
  
  COALESCE(ad.active_30d, 0) AS active_30d,
  
  -- 驗算
  dm.new_register_n - dm.delete_s AS net_increase,
  COALESCE(ma.mavs_new, 0) + COALESCE(mr.mavs_recall, 0) - COALESCE(mc.mavs_churn, 0) AS mavs_delta,

  -- Rates
  ROUND(SAFE_DIVIDE(COALESCE(pd.policy_valid, 0), dm.undeleted_e), 6) AS policy_rate,
  ROUND(SAFE_DIVIDE((SELECT COUNT(*) FROM carrier_valid), COALESCE(pd.policy_valid, 0)), 6) AS carrier_rate,
  ROUND(SAFE_DIVIDE(COALESCE(i30.has_invoice, 0), (SELECT COUNT(*) FROM carrier_valid)), 6) AS invoice_rate,
  ROUND(SAFE_DIVIDE(COALESCE(i30.has_carrier_invoice, 0), COALESCE(i30.has_invoice, 0)), 6) AS carrier_invoice_rate,
  ROUND(SAFE_DIVIDE(COALESCE(ma.mavs_total, 0), dm.undeleted_e), 6) AS mavs_rate,
  ROUND(SAFE_DIVIDE(COALESCE(pd.policy_renewed_7d, 0), NULLIF(COALESCE(pd.policy_expired_today, 0), 0)), 6) AS renew_success_rate

FROM daily_member dm
LEFT JOIN policy_daily pd ON pd.report_date = dm.report_date
LEFT JOIN invoice_30d i30 ON i30.report_date = dm.report_date
LEFT JOIN active_daily ad ON ad.report_date = dm.report_date
LEFT JOIN mavs_agg ma ON ma.report_date = dm.report_date
LEFT JOIN mavs_recall mr ON mr.report_date = dm.report_date
LEFT JOIN mavs_churn mc ON mc.report_date = dm.report_date
LEFT JOIN hyvs_daily hd ON hd.report_date = dm.report_date
ORDER BY dm.report_date
