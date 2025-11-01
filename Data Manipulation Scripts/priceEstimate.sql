CREATE OR REPLACE TABLE
  `sidewalk-chorus.propertytaxmap.PROPERTY_SALES_ADJ_SE` AS
  -- 0) StreetEasy index (wide → long), forward-fill each geo monthly
WITH
  se_raw AS (
  SELECT
    DATE(Month) AS month,
    NYC,
    Manhattan,
    Brooklyn,
    Queens
  FROM
    `sidewalk-chorus.propertytaxmap.STREETEASY_PRICE_INDEX` ),
  se_long AS (
  SELECT
    month,
    geo,
    idx
  FROM
    se_raw
  UNPIVOT
    (idx FOR geo IN (NYC,
        Manhattan,
        Brooklyn,
        Queens)) ),
  month_bounds AS (
  SELECT
    DATE_TRUNC((
      SELECT
        MIN(month)
      FROM
        se_long), MONTH) AS start_m,
    DATE_TRUNC(CURRENT_DATE(), MONTH) AS end_m ),
  calendar AS (
  SELECT
    m AS month
  FROM
    month_bounds,
    UNNEST(GENERATE_DATE_ARRAY(start_m, end_m, INTERVAL 1 MONTH)) AS m ),
  se_dense AS (
    -- Dense grid of (geo, month) with raw values
  SELECT
    g.geo,
    c.month,
    l.idx AS idx_raw
  FROM (
    SELECT
      DISTINCT geo
    FROM
      se_long) g
  CROSS JOIN
    calendar c
  LEFT JOIN
    se_long l
  ON
    l.geo = g.geo
    AND l.month = c.month ),
  se_ff AS (
    -- Forward-fill missing months per geo
  SELECT
    geo,
    month,
    LAST_VALUE(idx_raw IGNORE NULLS) OVER (PARTITION BY geo ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS idx
  FROM
    se_dense ),
  se_current AS (
    -- Latest available index per geo
  SELECT
    geo,
    month AS max_month,
    idx AS current_idx
  FROM (
    SELECT
      geo,
      month,
      idx,
      ROW_NUMBER() OVER (PARTITION BY geo ORDER BY month DESC) AS rn
    FROM
      se_ff
    WHERE
      idx IS NOT NULL )
  WHERE
    rn = 1 ),
  -- 1) Sales (annual table), map borough code → StreetEasy geo and month-bucket
  sales_base AS (
  SELECT
    s.*,
    CASE CAST(s.borough AS INT64)
      WHEN 1 THEN 'Manhattan'
      WHEN 3 THEN 'Brooklyn'
      WHEN 4 THEN 'Queens'
      ELSE 'NYC'
  END
    AS geo_for_index,
    DATE_TRUNC(DATE(s.sale_date), MONTH) AS sale_month
  FROM
    `sidewalk-chorus.propertytaxmap.SALES_ANNUAL_STG` s
  WHERE
    s.sale_price IS NOT NULL
    AND s.sale_price BETWEEN 10000
    AND 20000000 ),
  -- 2) Attach StreetEasy index at sale-month (forward-filled) and the latest per geo
  sales_with_idx AS (
  SELECT
    sb.*,
    si.idx AS se_idx_at_sale,
    sc.current_idx AS se_idx_current
  FROM
    sales_base sb
  JOIN
    se_ff si
  ON
    si.geo = sb.geo_for_index
    AND si.month = sb.sale_month
  JOIN
    se_current sc
  ON
    sc.geo = sb.geo_for_index )
SELECT
  sw.* EXCEPT(se_idx_at_sale,
    se_idx_current),
  -- keep these for transparency/debugging
  se_idx_at_sale,
  se_idx_current,
  CAST(sw.sale_price AS FLOAT64) * SAFE_DIVIDE(se_idx_current, NULLIF(se_idx_at_sale, 0)) AS sale_price_adj_se
FROM
  sales_with_idx sw;