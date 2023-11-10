CREATE OR REPLACE TABLE
  propertytaxmap.EstimatedTaxBills AS
WITH
  assembly_districts AS ( -- Assembly district boundaries and numbers
  SELECT
    AssemDist AS AssemblyDistrictNumber,
    ST_GEOGFROMTEXT(the_geom) AS AssemblyDistrictGeometry
  FROM
    `sidewalk-chorus.propertytaxmap.NYC_Assembly_Districts`),
  tax_rates_table AS ( -- Synthetic table for the tax rates
  SELECT
    1 AS TaxClass,
    20.31 / 100 AS TaxRate
  UNION ALL
  SELECT
    2,
    12.27 / 100
  UNION ALL
  SELECT
    3,
    12.76 / 100
  UNION ALL
  SELECT
    4,
    10.65 / 100 ),
  abatements_computed AS ( -- Aggregation of abatements for each property
  SELECT
    CAST(parid AS STRING) AS BoroughBlockLot,
    SUM(appliedabt) AS SumOfAppliedAbatements
  FROM
    `sidewalk-chorus.propertytaxmap.Abatements`
  WHERE
    period = "2Q"
  GROUP BY
    parid),
  pvad_computed AS (
  SELECT
    CAST(pvad.parid AS STRING) AS BoroughBlockLot,
    CAST(pvad.condo_number AS STRING) AS CondoNumber,
    CAST(LEFT(pvad.curtaxclass, 1) AS INT64) AS TaxClass,
    pvad.bldg_class AS BuildingClass,
    (pvad.condo_number IS NOT NULL
      AND pvad.bldg_class != "R0") AS IsCondoUnit,
    pvad.curmkttot AS CurrentMarketTotalValue,
    pvad.curtxbtot AS CurrentTaxableValue,
    pvad.curtxbextot AS CurrentExemptionValue
  FROM
    `sidewalk-chorus.propertytaxmap.PVAD_2023-11-10_3` AS pvad),
  pluto_computed AS (
  SELECT
    CAST(pluto.bbl AS STRING) AS BoroughBlockLot,
    pluto.address AS Address,
    pluto.zipcode AS ZipCode,
    pluto.borough AS Borough,
    pluto.ownername AS OwnerName,
    pluto.council AS CouncilDistrict,
    pluto.cd AS CommunityDistrict,
    pluto.latitude AS Latitude,
    pluto.longitude AS Longitude,
    ST_GEOGPOINT(pluto.longitude, pluto.latitude) AS GeoGPoint,
    pluto.yearbuilt AS YearBuilt,
    pluto.unitsres AS ResidentialUnits,
    CONCAT(LEFT(CAST(pluto.bbl AS STRING), 1), FORMAT('%05d', pluto.condono)) AS CondoNumber -- PLUTO has a per-borough condo number field. We need to combine it with the borocode (first digit of BBL to determine the property's cross-NYC condo number)
  FROM
    `sidewalk-chorus.propertytaxmap.PLUTO_2023-11-10` AS pluto)
SELECT
IF
  (pvad_computed.CondoNumber IS NOT NULL, pvad_computed.CondoNumber, pvad_computed.BoroughBlockLot) AS PropertyGroupKey,
  MAX(CASE
      WHEN pvad_computed.IsCondoUnit = FALSE THEN pvad_computed.BoroughBlockLot
    ELSE
    NULL
  END
    ) AS BoroughBlockLot,
  ARRAY_AGG(pvad_computed.BoroughBlockLot
  ORDER BY
    pvad_computed.BoroughBlockLot ASC) AS ComponentPropertyBoroughBlockLots,
  ANY_VALUE(pvad_computed.CondoNumber) AS CondoNumber,
  ANY_VALUE(assembly_districts.AssemblyDistrictNumber) AS AssemblyDistrict,
  ANY_VALUE(CouncilDistrict) AS CouncilDistrict,
  ANY_VALUE(CommunityDistrict) AS CommunityDistrict,
  ANY_VALUE(Latitude) AS Latitude,
  ANY_VALUE(Longitude) AS Longitude,
  ANY_VALUE(YearBuilt) AS YearBuilt,
  ANY_VALUE(pvad_computed.TaxClass) AS TaxClass,
  ANY_VALUE(pvad_computed.CondoNumber IS NOT NULL) AS IsCondoProperty,
  SUM(pvad_computed.CurrentMarketTotalValue) AS CurrentMarketTotalValue,
  SUM(pvad_computed.CurrentTaxableValue) AS CurrentTaxableValue,
  SUM(pvad_computed.CurrentExemptionValue) AS CurrentExemptionValue,
  SUM(abatements_computed.SumOfAppliedAbatements) AS SumOfAppliedAbatements,
  ROUND(SUM((pvad_computed.CurrentTaxableValue - pvad_computed.CurrentExemptionValue) * tax_rates_table.TaxRate - IFNULL(abatements_computed.SumOfAppliedAbatements, 0)), 2) AS TaxBill,
  ROUND(SAFE_DIVIDE(SUM((pvad_computed.CurrentTaxableValue - pvad_computed.CurrentExemptionValue) * tax_rates_table.TaxRate - IFNULL(abatements_computed.SumOfAppliedAbatements, 0)), SUM(pvad_computed.CurrentMarketTotalValue)),8) AS EffectiveTaxRate,
FROM
  pvad_computed
INNER JOIN -- only keep the properties that are in both PVAD and PLUTO. There are some properties that (for some reason) are not included in PLUTO. This is mostly class 4 utility properties.
  pluto_computed
ON
  pvad_computed.BoroughBlockLot = pluto_computed.BoroughBlockLot
LEFT JOIN
  assembly_districts
ON
  ST_CONTAINS(assembly_districts.AssemblyDistrictGeometry, pluto_computed.GeoGPoint)
LEFT JOIN
  abatements_computed
ON
  pvad_computed.BoroughBlockLot = abatements_computed.BoroughBlockLot
LEFT JOIN
  tax_rates_table
ON
  pvad_computed.TaxClass = tax_rates_table.TaxClass
  -- WHERE
  --   pvad_computed.CondoNumber = "100058"
  --   OR pvad_computed.BoroughBlockLot IN ("1013960033",
  --     "1013940023")
GROUP BY
  PropertyGroupKey ;