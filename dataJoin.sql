CREATE OR REPLACE TABLE
  propertytaxmap.EstimatedTaxBills AS
WITH
  -- Synthetic table for the tax rates
  get_tax_rate AS (
  SELECT
    1 AS tax_class,
    20.31 AS tax_rate
  UNION ALL
  SELECT
    2,
    12.27
  UNION ALL
  SELECT
    3,
    12.76
  UNION ALL
  SELECT
    4,
    10.65 ),
  -- Aggregation of abatements for each property
  abatements AS (
  SELECT
    parid,
    COUNT(*) AS DistinctAbatements,
    SUM(appliedabt) AS SumOfAppliedAbatements
  FROM
    `sidewalk-chorus.propertytaxmap.Abatements`
  WHERE
    period = "2Q"
  GROUP BY
    parid)
SELECT
  pvad.parid AS BoroughBlockLot,
  pluto.address AS Address,
  pluto.zipcode AS ZipCode,
  pluto.borough AS Borough,
  pluto.ownername AS OwnerName,
  -- If the property is a condo unit, determine the name of the unit owner (in addition to the name of the building owner, which is typically the condo association)
  IF(pvad.condo_number IS NOT NULL AND pvad.bldg_class != "R0", pvad.owner, NULL) AS CondoUnitOwnerName,
  pvad.condo_number AS CondoNumber,
  pluto.council AS CouncilDistrict,
  pluto.cd AS CommunityDistrict,
  pluto.latitude AS Latitude,
  pluto.longitude AS Longitude,
  pluto.yearbuilt AS YearBuilt,
  IF(pvad.condo_number IS NOT NULL AND pvad.bldg_class != "R0", 1, pluto.unitsres) AS ResidentialUnits,
  pvad.curtaxclass AS TaxClass,
  IF(pvad.condo_number IS NOT NULL AND pvad.bldg_class != "R0", TRUE, FALSE) AS IsCondoUnit,
  pvad.curmkttot AS CurrentMarketTotalValue,
  pvad.curtxbtot AS CurrentTaxableValue,
  pvad.curtxbextot AS CurrentExemptionValue,
  abatements.DistinctAbatements,
  abatements.SumOfAppliedAbatements,
  ROUND((pvad.curtxbtot - pvad.curtxbextot) * tax_rate_table.tax_rate / 100 - IFNULL(abatements.SumOfAppliedAbatements, 0), 2) AS TaxBill,
  ROUND(SAFE_DIVIDE((pvad.curtxbtot - pvad.curtxbextot) * tax_rate_table.tax_rate / 100 - IFNULL(abatements.SumOfAppliedAbatements, 0), pvad.curmkttot),8) AS EffectiveTaxRate,
FROM
  `sidewalk-chorus.propertytaxmap.PVAD_2023-11-10_3` AS pvad
LEFT JOIN
  `sidewalk-chorus.propertytaxmap.PLUTO_2023-11-10` AS pluto
ON
  -- CAST(pluto.bbl AS STRING) = pvad.parid
  IF(pvad.condo_number IS NOT NULL, CAST(pvad.condo_number AS STRING) = CONCAT(LEFT(CAST(pluto.bbl AS STRING), 1), FORMAT('%05d', pluto.condono)), CAST(pluto.bbl AS STRING) = pvad.parid)
JOIN
  get_tax_rate AS tax_rate_table
ON
  pvad.curtaxclass = CAST(tax_rate_table.tax_class AS STRING)
LEFT JOIN
  abatements
ON
  pvad.parid = CAST(abatements.parid AS STRING)
-- WHERE
  -- -- pvad.curtaxclass IN ("1", "2")
  --   -- AND 
  --   pvad.parid IN ("1010487501", "1010481068")
  -- LIMIT
  --   10
  ;