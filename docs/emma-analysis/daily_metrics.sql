-- 每日會員斷點分析 Prototype（單月：2026-02-01 ~ 2026-02-28）
-- 使用原始資料計算所有指標

DECLARE report_start DATE DEFAULT '2026-02-01';
DECLARE report_end DATE DEFAULT '2026-02-28';

WITH
-- 1. 生成日期序列
date_spine AS (
  SELECT d AS report_date
  FROM UNNEST(GENERATE_DATE_ARRAY(report_start, report_end)) AS d
),

-- 2. 會員基本資料（取最新狀態）
members AS (
  SELECT
    m.member_hk,
    h.member_id,
    m.status,
    CAST(m.created_at AS DATE) AS register_date,
    m.effective_from AS status_updated_at,
    -- SCD: 取每個 member 最新的一筆
    ROW_NUMBER() OVER (PARTITION BY m.member_hk ORDER BY m.effective_from DESC) AS rn
  FROM `production-379804.base_marts.base__sat__member` m
  JOIN `production-379804.base_marts.base__hub__member` h ON m.member_hk = h.member_hk
),
members_latest AS (
  SELECT * FROM members WHERE rn = 1
),

-- 3. 每日活躍（Firebase session_start，近30日有 session 算活躍）
daily_sessions AS (
  SELECT
    CAST(user_id AS INT64) AS member_id,
    PARSE_DATE('%Y%m%d', _TABLE_SUFFIX) AS session_date,
    LOWER(platform) AS platform
  FROM `invoice-bfd85.analytics_382839978.events_intraday_*`
  WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(report_start, INTERVAL 30 DAY))
                          AND FORMAT_DATE('%Y%m%d', report_end)
    AND event_name = 'session_start'
    AND user_id IS NOT NULL
    AND user_id != ''
),
-- 每個 member_id 每天是否有 session
member_daily_active AS (
  SELECT DISTINCT member_id, session_date
  FROM daily_sessions
),

-- 4. Policy 有效判斷（6個月有效期）
policy_events AS (
  SELECT
    member_hk,
    CAST(effective_from AS DATE) AS policy_accepted_date,
    DATE_ADD(CAST(effective_from AS DATE), INTERVAL 180 DAY) AS policy_expiry_date
  FROM `production-379804.base_marts.base__ma_sat__member_policy_statement`
),

-- 5. 載具有效判斷
carrier_status AS (
  SELECT
    mc.member_hk,
    c.is_active AS carrier_is_active,
    c.mof_status,
    ROW_NUMBER() OVER (PARTITION BY mc.member_hk ORDER BY c.effective_from DESC) AS rn
  FROM `production-379804.base_marts.base__sat__carrier` c
  JOIN `production-379804.base_marts.base__link__member_carrier` mc ON c.carrier_hk = mc.carrier_hk
),
carrier_latest AS (
  SELECT * FROM carrier_status WHERE rn = 1
),

-- 6. 發票（近30天有發票）
invoices AS (
  SELECT
    mi.member_hk,
    CAST(i.issued_at AS DATE) AS invoice_date,
    i.carrier_type
  FROM `production-379804.base_marts.base__sat__invoice` i
  JOIN `production-379804.base_marts.base__link__member_invoice` mi ON i.invoice_hk = mi.invoice_hk
  WHERE CAST(i.issued_at AS DATE) BETWEEN DATE_SUB(report_start, INTERVAL 180 DAY) AND report_end
),

-- === 組裝每日指標 ===
daily_metrics AS (
  SELECT
    ds.report_date,

    -- 會員數
    COUNT(DISTINCT ml.member_hk) AS total_member,
    COUNT(DISTINCT CASE WHEN ml.register_date = ds.report_date THEN ml.member_hk END) AS new_register_n,
    COUNT(DISTINCT CASE WHEN ml.status IN ('DEACTIVATED', 'INACTIVE') AND CAST(ml.status_updated_at AS DATE) = ds.report_date THEN ml.member_hk END) AS delete_s,
    COUNT(DISTINCT CASE WHEN ml.status NOT IN ('DEACTIVATED', 'INACTIVE') THEN ml.member_hk END) AS undeleted_e,

    -- Policy 有效
    COUNT(DISTINCT CASE 
      WHEN EXISTS (
        SELECT 1 FROM policy_events pe 
        WHERE pe.member_hk = ml.member_hk 
          AND pe.policy_accepted_date <= ds.report_date 
          AND pe.policy_expiry_date > ds.report_date
      ) THEN ml.member_hk 
    END) AS policy_valid,

    -- 載具有效
    COUNT(DISTINCT CASE 
      WHEN cl.carrier_is_active = TRUE THEN ml.member_hk 
    END) AS carrier_valid,

    -- 近30天有發票
    COUNT(DISTINCT CASE 
      WHEN EXISTS (
        SELECT 1 FROM invoices inv 
        WHERE inv.member_hk = ml.member_hk 
          AND inv.invoice_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
      ) THEN ml.member_hk 
    END) AS has_invoice,

    -- 近30天有載具發票
    COUNT(DISTINCT CASE 
      WHEN EXISTS (
        SELECT 1 FROM invoices inv 
        WHERE inv.member_hk = ml.member_hk 
          AND inv.invoice_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
          AND inv.carrier_type IS NOT NULL AND inv.carrier_type != ''
      ) THEN ml.member_hk 
    END) AS has_carrier_invoice,

    -- 近30天活躍
    COUNT(DISTINCT CASE
      WHEN EXISTS (
        SELECT 1 FROM member_daily_active mda 
        JOIN `production-379804.base_marts.base__hub__member` h2 ON h2.member_id = mda.member_id
        WHERE h2.member_hk = ml.member_hk
          AND mda.session_date BETWEEN DATE_SUB(ds.report_date, INTERVAL 30 DAY) AND ds.report_date
      ) THEN ml.member_hk
    END) AS active_30d

  FROM date_spine ds
  CROSS JOIN members_latest ml
  LEFT JOIN carrier_latest cl ON ml.member_hk = cl.member_hk
  GROUP BY ds.report_date
)

SELECT
  report_date AS date,
  total_member,
  new_register_n,
  delete_s,
  undeleted_e,
  policy_valid,
  carrier_valid,
  has_invoice,
  has_carrier_invoice,
  active_30d,

  -- MAVS = 近30日活躍 + 載具有效 + Policy有效（需要同時符合三個條件，這裡先用近似值）
  -- 精確的 MAVS 需要在下一版做 member-level 交叉判斷

  -- 計算 rates
  SAFE_DIVIDE(policy_valid, undeleted_e) AS policy_rate,
  SAFE_DIVIDE(carrier_valid, policy_valid) AS carrier_rate,
  SAFE_DIVIDE(has_invoice, carrier_valid) AS invoice_rate,
  SAFE_DIVIDE(has_carrier_invoice, has_invoice) AS carrier_invoice_rate

FROM daily_metrics
ORDER BY report_date
